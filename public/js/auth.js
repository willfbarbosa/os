/**
 * MÓDULO DE AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS (ELETROZONE)
 * Controla login, logout, sessões no LocalStorage e permissões do sistema.
 */

const auth = {
  currentUser: null,
  users: [],

  init() {
    const saved = localStorage.getItem('eletrozone_user');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
        this.updateUIForUser();
        document.getElementById('login-modal').classList.remove('active');
      } catch (e) {
        this.logout();
      }
    } else {
      document.getElementById('login-modal').classList.add('active');
    }
  },

  async handleLogin(event) {
    event.preventDefault();
    const usernameInput = document.getElementById('login-username').value;
    const passwordInput = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });

      const data = await res.json();
      if (data.success) {
        this.currentUser = data.user;
        localStorage.setItem('eletrozone_user', JSON.stringify(data.user));
        document.getElementById('login-modal').classList.remove('active');
        this.updateUIForUser();
        app.showToast(`Bem-vindo, ${data.user.fullname}!`, 'success');
        app.loadDashboardMetrics();
        quotes.loadQuotes();
        receipts.loadReceipts();
      } else {
        app.showToast(data.message || 'Erro ao realizar login.', 'error');
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro de conexão com o servidor.', 'error');
    }
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem('eletrozone_user');
    document.getElementById('login-modal').classList.add('active');
    app.showToast('Sessão encerrada.', 'info');
  },

  updateUIForUser() {
    if (!this.currentUser) return;

    // Sidebar User Info
    const avatar = document.getElementById('sidebar-user-avatar');
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');

    if (avatar) avatar.textContent = (this.currentUser.fullname || 'U').charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = this.currentUser.fullname;
    if (roleEl) roleEl.textContent = this.currentUser.role === 'ADMIN' ? 'Administrador' : 'Operador';

    // Ocultar aba de usuários para não-admins
    const usersNav = document.getElementById('nav-users');
    const logsNav = document.getElementById('nav-logs');
    const isAdmin = this.currentUser.role === 'ADMIN' || this.currentUser.permissions?.isAdmin;

    if (usersNav) usersNav.style.display = isAdmin ? 'flex' : 'none';
    if (logsNav) logsNav.style.display = isAdmin ? 'flex' : 'none';
  },

  async loadUsers() {
    if (!this.currentUser || (!this.currentUser.permissions?.isAdmin && this.currentUser.role !== 'ADMIN')) return;
    try {
      const res = await fetch('/api/auth/users');
      const data = await res.json();
      if (data.success) {
        this.users = data.users || [];
        this.renderUsersTable();
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro ao carregar lista de usuários.', 'error');
    }
  },

  renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (this.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Nenhum usuário cadastrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.users.map(u => {
      const perms = u.permissions || {};
      const permBadges = [
        perms.isAdmin ? '<span class="badge badge-approved">Admin Mestre</span>' : '',
        perms.canCreate ? '<span class="badge badge-converted">Criar</span>' : '',
        perms.canEdit ? '<span class="badge badge-pending">Editar</span>' : '',
        perms.canDelete ? '<span class="badge badge-canceled">Excluir</span>' : ''
      ].filter(Boolean).join(' ');

      const dateFormatted = u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '---';

      return `
        <tr>
          <td><strong>${u.fullname}</strong></td>
          <td><code>${u.username}</code></td>
          <td>${u.role}</td>
          <td>${permBadges}</td>
          <td>${dateFormatted}</td>
          <td>
            <div class="action-btns">
              <button class="btn btn-outline btn-sm" onclick="auth.openUserModal('${u.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
              ${u.username !== 'admin' ? `<button class="btn btn-outline btn-sm" onclick="auth.deleteUser('${u.id}')" title="Excluir" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openUserModal(userId = null) {
    document.getElementById('user-id').value = '';
    document.getElementById('user-fullname').value = '';
    document.getElementById('user-username').value = '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-perm-admin').checked = false;
    document.getElementById('user-perm-create').checked = true;
    document.getElementById('user-perm-edit').checked = true;
    document.getElementById('user-perm-delete').checked = false;

    document.getElementById('user-modal-title').textContent = userId ? 'Editar Usuário' : 'Novo Usuário';

    if (userId) {
      const target = this.users.find(u => u.id === userId);
      if (target) {
        document.getElementById('user-id').value = target.id;
        document.getElementById('user-fullname').value = target.fullname;
        document.getElementById('user-username').value = target.username;
        const p = target.permissions || {};
        document.getElementById('user-perm-admin').checked = !!p.isAdmin;
        document.getElementById('user-perm-create').checked = !!p.canCreate;
        document.getElementById('user-perm-edit').checked = !!p.canEdit;
        document.getElementById('user-perm-delete').checked = !!p.canDelete;
      }
    }

    document.getElementById('user-modal').classList.add('active');
  },

  closeUserModal() {
    document.getElementById('user-modal').classList.remove('active');
  },

  async saveUser() {
    const id = document.getElementById('user-id').value;
    const fullname = document.getElementById('user-fullname').value.trim();
    const username = document.getElementById('user-username').value.trim();
    const password = document.getElementById('user-password').value;

    if (!fullname || !username) {
      app.showToast('Preencha os campos obrigatórios.', 'error');
      return;
    }

    const permissions = {
      isAdmin: document.getElementById('user-perm-admin').checked,
      canCreate: document.getElementById('user-perm-create').checked,
      canEdit: document.getElementById('user-perm-edit').checked,
      canDelete: document.getElementById('user-perm-delete').checked
    };

    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, fullname, username, password, permissions })
      });

      const data = await res.json();
      if (data.success) {
        app.showToast('Usuário salvo com sucesso!', 'success');
        this.closeUserModal();
        this.loadUsers();
      } else {
        app.showToast(data.message || 'Erro ao salvar usuário.', 'error');
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro ao conectar ao servidor.', 'error');
    }
  },

  async deleteUser(userId) {
    if (!confirm('Deseja realmente excluir este usuário?')) return;
    try {
      const res = await fetch(`/api/auth/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        app.showToast('Usuário removido.', 'info');
        this.loadUsers();
      } else {
        app.showToast(data.message || 'Erro ao excluir usuário.', 'error');
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro na requisição.', 'error');
    }
  }
};
