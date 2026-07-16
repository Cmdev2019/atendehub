import { createElement as h, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../services/api';
import { wsClient } from '../../services/websocket';
import { Icon } from '../icons';

// ── Níveis de usuário (Role do backend → rótulo do produto) ─────────────────
export const ROLE_LABELS = {
  AGENT: 'Usuário comum (atendente)',
  SUPERVISOR: 'Líder de setor',
  ADMIN: 'Administrador',
  SUPER_ADMIN: 'Super administrador',
};

// Níveis atribuíveis pela tela (SUPER_ADMIN é interno do sistema)
const ASSIGNABLE_ROLES = ['AGENT', 'SUPERVISOR', 'ADMIN'];

const CONNECTION_STATUS_LABELS = {
  CONNECTED: { label: 'Conectado', tone: 'ok' },
  CONNECTING: { label: 'Conectando…', tone: 'pending' },
  QR_CODE: { label: 'Aguardando leitura do QR', tone: 'pending' },
  DISCONNECTED: { label: 'Desconectado', tone: 'off' },
  ERROR: { label: 'Erro', tone: 'err' },
};

// A API ora retorna array puro, ora { data: [...] }
const unwrap = (res) => (Array.isArray(res) ? res : res?.data ?? []);
const errMsg = (e) => e?.message || 'Erro inesperado';

// ─────────────────────────────────────────────────────────────────────────────
// Seção: Aparência
// ─────────────────────────────────────────────────────────────────────────────
function AppearanceSection() {
  const { isDark, toggleTheme } = useTheme();

  return h(
    'div',
    { className: 'settings-section' },
    h('h3', null, h(Icon, { name: 'palette', size: 17 }), ' Aparência'),
    h('p', { className: 'settings-hint' }, 'Preferências visuais do sistema.'),
    h(
      'div',
      { className: 'settings-row' },
      h(
        'div',
        null,
        h('div', { className: 'settings-row-title' }, 'Tema do sistema'),
        h('div', { className: 'settings-hint' }, isDark ? 'Modo escuro ativo' : 'Modo claro ativo'),
      ),
      h(
        'button',
        { className: 'settings-btn', type: 'button', onClick: toggleTheme },
        h(Icon, { name: isDark ? 'sun' : 'moon', size: 15 }),
        isDark ? ' Mudar para claro' : ' Mudar para escuro',
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Seção: Conexões WhatsApp (QR Code)
// ─────────────────────────────────────────────────────────────────────────────
function WhatsappSection() {
  const [connections, setConnections] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // { connectionId, image } — QR atualmente exibido
  const [qr, setQr] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setConnections(unwrap(await apiClient.getWhatsappConnections()));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    load();

    // Status em tempo real vindo do gateway (connection.status)
    wsClient.on('connection.status', (payload) => {
      if (!payload?.connectionId) return;
      setConnections((prev) =>
        prev.map((c) =>
          c.id === payload.connectionId
            ? { ...c, status: payload.status, phone: payload.phone ?? c.phone }
            : c,
        ),
      );
      if (payload.status === 'CONNECTED') {
        setQr((current) => (current?.connectionId === payload.connectionId ? null : current));
      }
    });

    return () => {
      wsClient.off('connection.status');
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  // Enquanto um QR está na tela, sincroniza o status a cada 4s
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!qr) return;

    pollRef.current = setInterval(async () => {
      try {
        const status = await apiClient.getWhatsappStatus(qr.connectionId);
        if (status?.status === 'CONNECTED') {
          setQr(null);
          load();
        }
      } catch {
        // erro transitório de sync não interrompe o polling
      }
    }, 4000);

    return () => clearInterval(pollRef.current);
  }, [qr, load]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const created = await apiClient.createWhatsappConnection({ name: name.trim() });
      setName('');
      await load();
      if (created?.id) await generateQr(created.id);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const generateQr = async (id) => {
    setBusy(true);
    try {
      const res = await apiClient.getWhatsappQrCode(id);
      if (res?.qrCode) {
        const image = res.qrCode.startsWith('data:')
          ? res.qrCode
          : `data:image/png;base64,${res.qrCode}`;
        setQr({ connectionId: id, image });
        setError(null);
      } else {
        setError('QR Code ainda não disponível — tente novamente em alguns segundos.');
      }
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (id) => {
    if (!confirm('Desconectar este WhatsApp?')) return;
    try {
      await apiClient.disconnectWhatsapp(id);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const remove = async (id) => {
    if (!confirm('Excluir esta conexão? As conversas associadas serão mantidas.')) return;
    try {
      await apiClient.deleteWhatsappConnection(id);
      setQr((current) => (current?.connectionId === id ? null : current));
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return h(
    'div',
    { className: 'settings-section' },
    h('h3', null, h(Icon, { name: 'smartphone', size: 17 }), ' Conexões WhatsApp'),
    h('p', { className: 'settings-hint' },
      'Crie uma conexão e escaneie o QR Code com o WhatsApp do número desejado ' +
      '(WhatsApp → Dispositivos conectados → Conectar dispositivo).'),
    error && h('div', { className: 'settings-error', role: 'alert' }, h(Icon, { name: 'warning', size: 15 }), ` ${error}`),

    h(
      'form',
      { className: 'settings-form-row', onSubmit: create },
      h('input', {
        className: 'settings-input',
        placeholder: 'Nome da conexão (ex.: Comercial)',
        value: name,
        maxLength: 60,
        onChange: (e) => setName(e.target.value),
      }),
      h('button', { className: 'settings-btn primary', type: 'submit', disabled: busy || !name.trim() },
        h(Icon, { name: 'plus', size: 14 }), ' Criar conexão'),
    ),

    h(
      'div',
      { className: 'settings-list' },
      connections.length === 0
        ? h('p', { className: 'settings-hint' }, 'Nenhuma conexão criada ainda.')
        : connections.map((conn) => {
            const st = CONNECTION_STATUS_LABELS[conn.status] ?? { label: conn.status, tone: 'off' };
            return h(
              'div',
              { key: conn.id, className: 'settings-item' },
              h(
                'div',
                { className: 'settings-item-main' },
                h('div', { className: 'settings-row-title' }, conn.name),
                h('div', { className: 'settings-hint' },
                  conn.phone ? h('span', null, h(Icon, { name: 'phone', size: 12 }), ` ${conn.phone}`) : 'Sem número pareado'),
              ),
              h('span', { className: `settings-badge ${st.tone}` }, st.label),
              h(
                'div',
                { className: 'settings-item-actions' },
                conn.status !== 'CONNECTED' &&
                  h('button', {
                    className: 'settings-btn',
                    type: 'button',
                    disabled: busy,
                    onClick: () => generateQr(conn.id),
                  }, h(Icon, { name: 'qr', size: 14 }), ' Gerar QR'),
                conn.status === 'CONNECTED' &&
                  h('button', {
                    className: 'settings-btn',
                    type: 'button',
                    onClick: () => disconnect(conn.id),
                  }, h(Icon, { name: 'pause', size: 14 }), ' Desconectar'),
                h('button', {
                  className: 'settings-btn danger',
                  type: 'button',
                  onClick: () => remove(conn.id),
                }, h(Icon, { name: 'trash', size: 15, label: 'Excluir' })),
              ),
            );
          }),
    ),

    qr && h(
      'div',
      { className: 'settings-qr' },
      h('h4', null, 'Escaneie com o WhatsApp do celular'),
      h('img', { src: qr.image, alt: 'QR Code de pareamento do WhatsApp', width: 240, height: 240 }),
      h('p', { className: 'settings-hint' },
        'O status muda para "Conectado" automaticamente após a leitura.'),
      h('button', {
        className: 'settings-btn',
        type: 'button',
        onClick: () => generateQr(qr.connectionId),
      }, h(Icon, { name: 'refresh', size: 14 }), ' Gerar novo QR'),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Seção: Usuários (criação + níveis de acesso)
// ─────────────────────────────────────────────────────────────────────────────
function UsersSection({ canManage }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'AGENT' });

  const load = useCallback(async () => {
    try {
      setUsers(unwrap(await apiClient.getUsers()));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiClient.createUser(form);
      setForm({ name: '', email: '', password: '', role: 'AGENT' });
      setError(null);
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (id, role) => {
    try {
      await apiClient.updateUser(id, { role });
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const toggleActive = async (u) => {
    try {
      await apiClient.updateUser(u.id, { isActive: !u.isActive });
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const remove = async (u) => {
    if (!confirm(`Excluir o usuário "${u.name}"?`)) return;
    try {
      await apiClient.deleteUser(u.id);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return h(
    'div',
    { className: 'settings-section' },
    h('h3', null, h(Icon, { name: 'user', size: 17 }), ' Usuários e níveis de acesso'),
    h('p', { className: 'settings-hint' },
      'Níveis: Usuário comum (atende conversas) · Líder de setor (supervisiona) · Administrador (gerencia tudo).'),
    error && h('div', { className: 'settings-error', role: 'alert' }, h(Icon, { name: 'warning', size: 15 }), ` ${error}`),

    canManage && h(
      'form',
      { className: 'settings-form-grid', onSubmit: create },
      h('input', {
        className: 'settings-input', placeholder: 'Nome completo', required: true,
        maxLength: 120, value: form.name, onChange: setField('name'),
      }),
      h('input', {
        className: 'settings-input', placeholder: 'E-mail', type: 'email', required: true,
        value: form.email, onChange: setField('email'),
      }),
      h('input', {
        className: 'settings-input',
        placeholder: 'Senha (mín. 8, com maiúscula, minúscula e número)',
        type: 'password', required: true, minLength: 8,
        value: form.password, onChange: setField('password'),
      }),
      h(
        'select',
        { className: 'settings-input', value: form.role, onChange: setField('role') },
        ASSIGNABLE_ROLES.map((r) => h('option', { key: r, value: r }, ROLE_LABELS[r])),
      ),
      h('button', { className: 'settings-btn primary', type: 'submit', disabled: busy },
        h(Icon, { name: 'plus', size: 14 }), ' Criar usuário'),
    ),

    h(
      'div',
      { className: 'settings-list' },
      users.map((u) =>
        h(
          'div',
          { key: u.id, className: `settings-item${u.isActive === false ? ' inactive' : ''}` },
          h(
            'div',
            { className: 'settings-item-main' },
            h('div', { className: 'settings-row-title' }, u.name),
            h('div', { className: 'settings-hint' }, u.email),
          ),
          canManage && u.role !== 'SUPER_ADMIN'
            ? h(
                'select',
                {
                  className: 'settings-input compact',
                  value: u.role,
                  onChange: (e) => changeRole(u.id, e.target.value),
                  title: 'Nível de acesso',
                },
                ASSIGNABLE_ROLES.map((r) => h('option', { key: r, value: r }, ROLE_LABELS[r])),
              )
            : h('span', { className: 'settings-badge' }, ROLE_LABELS[u.role] ?? u.role),
          canManage && h(
            'div',
            { className: 'settings-item-actions' },
            h('button', {
              className: 'settings-btn', type: 'button', onClick: () => toggleActive(u),
              title: u.isActive === false ? 'Reativar usuário' : 'Desativar usuário',
            }, h(Icon, { name: u.isActive === false ? 'play' : 'pause', size: 14 }),
              u.isActive === false ? ' Ativar' : ' Desativar'),
            h('button', {
              className: 'settings-btn danger', type: 'button', onClick: () => remove(u),
              title: 'Excluir usuário',
            }, h(Icon, { name: 'trash', size: 15, label: 'Excluir' })),
          ),
        ),
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Seção: Grupos (setores/departamentos)
// ─────────────────────────────────────────────────────────────────────────────
function GroupsSection() {
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#0f766e' });
  // Detalhe expandido: { id, users: [...] }
  const [expanded, setExpanded] = useState(null);
  const [memberToAdd, setMemberToAdd] = useState('');

  const load = useCallback(async () => {
    try {
      const [deps, us] = await Promise.all([
        apiClient.getDepartments(),
        apiClient.getUsers().catch(() => []),
      ]);
      setDepartments(unwrap(deps));
      setUsers(unwrap(us));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    if (expanded?.id === id) {
      setExpanded(null);
      return;
    }
    try {
      const detail = await apiClient.getDepartment(id);
      setExpanded({ id, users: detail?.users ?? [] });
      setMemberToAdd('');
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiClient.createDepartment({ name: form.name.trim(), color: form.color });
      setForm({ name: '', color: '#0f766e' });
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (dept) => {
    if (!confirm(`Excluir o grupo "${dept.name}"?`)) return;
    try {
      await apiClient.deleteDepartment(dept.id);
      if (expanded?.id === dept.id) setExpanded(null);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const addMember = async (deptId) => {
    if (!memberToAdd) return;
    try {
      const res = await apiClient.addUserToDepartment(deptId, memberToAdd);
      setExpanded({ id: deptId, users: res?.users ?? [] });
      setMemberToAdd('');
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const removeMember = async (deptId, userId) => {
    try {
      const res = await apiClient.removeUserFromDepartment(deptId, userId);
      setExpanded({ id: deptId, users: res?.users ?? [] });
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const availableUsers = expanded
    ? users.filter((u) => !expanded.users.some((m) => m.id === u.id))
    : [];

  return h(
    'div',
    { className: 'settings-section' },
    h('h3', null, h(Icon, { name: 'users', size: 17 }), ' Grupos (setores)'),
    h('p', { className: 'settings-hint' },
      'Organize os atendentes em setores — cada grupo pode ter sua fila e conexões.'),
    error && h('div', { className: 'settings-error', role: 'alert' }, h(Icon, { name: 'warning', size: 15 }), ` ${error}`),

    h(
      'form',
      { className: 'settings-form-row', onSubmit: create },
      h('input', {
        className: 'settings-input', placeholder: 'Nome do grupo (ex.: Suporte)',
        maxLength: 80, value: form.name,
        onChange: (e) => setForm((f) => ({ ...f, name: e.target.value })),
      }),
      h('input', {
        className: 'settings-color', type: 'color', value: form.color,
        title: 'Cor do grupo',
        onChange: (e) => setForm((f) => ({ ...f, color: e.target.value })),
      }),
      h('button', { className: 'settings-btn primary', type: 'submit', disabled: busy || !form.name.trim() },
        h(Icon, { name: 'plus', size: 14 }), ' Criar grupo'),
    ),

    h(
      'div',
      { className: 'settings-list' },
      departments.map((dept) =>
        h(
          'div',
          { key: dept.id, className: 'settings-item column' },
          h(
            'div',
            { className: 'settings-item-row' },
            h('span', { className: 'settings-color-dot', style: { background: dept.color || '#94a3b8' } }),
            h(
              'div',
              { className: 'settings-item-main' },
              h('div', { className: 'settings-row-title' }, dept.name),
              h('div', { className: 'settings-hint' },
                `${dept._count?.users ?? dept.users?.length ?? 0} membro(s)`),
            ),
            h(
              'div',
              { className: 'settings-item-actions' },
              h('button', {
                className: 'settings-btn', type: 'button', onClick: () => openDetail(dept.id),
              }, h(Icon, { name: expanded?.id === dept.id ? 'chevron-up' : 'chevron-down', size: 14 }),
                expanded?.id === dept.id ? ' Fechar' : ' Membros'),
              h('button', {
                className: 'settings-btn danger', type: 'button', onClick: () => remove(dept),
              }, h(Icon, { name: 'trash', size: 15, label: 'Excluir' })),
            ),
          ),

          expanded?.id === dept.id && h(
            'div',
            { className: 'settings-members' },
            expanded.users.length === 0
              ? h('p', { className: 'settings-hint' }, 'Nenhum membro neste grupo.')
              : expanded.users.map((m) =>
                  h(
                    'div',
                    { key: m.id, className: 'settings-member' },
                    h('span', null, m.name),
                    h('button', {
                      className: 'settings-btn danger small', type: 'button',
                      title: 'Remover do grupo',
                      onClick: () => removeMember(dept.id, m.id),
                    }, h(Icon, { name: 'x', size: 12, label: 'Remover do grupo' })),
                  ),
                ),
            h(
              'div',
              { className: 'settings-form-row' },
              h(
                'select',
                {
                  className: 'settings-input',
                  value: memberToAdd,
                  onChange: (e) => setMemberToAdd(e.target.value),
                },
                h('option', { value: '' }, 'Adicionar membro…'),
                availableUsers.map((u) =>
                  h('option', { key: u.id, value: u.id }, `${u.name} — ${ROLE_LABELS[u.role] ?? u.role}`),
                ),
              ),
              h('button', {
                className: 'settings-btn', type: 'button',
                disabled: !memberToAdd,
                onClick: () => addMember(dept.id),
              }, h(Icon, { name: 'plus', size: 14 }), ' Adicionar'),
            ),
          ),
        ),
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Painel principal de Configurações
// ─────────────────────────────────────────────────────────────────────────────
export function SettingsPanel() {
  const { user } = useAuth();
  const role = user?.role;
  const canManage = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const canViewUsers = canManage || role === 'SUPERVISOR';

  const sections = [
    { id: 'appearance', label: 'Aparência', icon: 'palette', visible: true },
    { id: 'whatsapp', label: 'Conexões WhatsApp', icon: 'smartphone', visible: canManage },
    { id: 'users', label: 'Usuários e níveis', icon: 'user', visible: canViewUsers },
    { id: 'groups', label: 'Grupos (setores)', icon: 'users', visible: canManage },
  ].filter((s) => s.visible);

  const [active, setActive] = useState(sections[0]?.id ?? 'appearance');

  return h(
    'div',
    { className: 'settings-panel' },
    h(
      'nav',
      { className: 'settings-nav', 'aria-label': 'Seções de configurações' },
      h('h2', null, h(Icon, { name: 'settings', size: 17 }), ' Configurações'),
      sections.map((s) =>
        h(
          'button',
          {
            key: s.id,
            type: 'button',
            className: `settings-nav-item${active === s.id ? ' active' : ''}`,
            onClick: () => setActive(s.id),
          },
          h(Icon, { name: s.icon, size: 16 }),
          ` ${s.label}`,
        ),
      ),
    ),
    h(
      'div',
      { className: 'settings-content' },
      active === 'appearance' && h(AppearanceSection),
      active === 'whatsapp' && canManage && h(WhatsappSection),
      active === 'users' && canViewUsers && h(UsersSection, { canManage }),
      active === 'groups' && canManage && h(GroupsSection),
    ),
  );
}
