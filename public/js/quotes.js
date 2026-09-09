/**
 * MÓDULO DE ORÇAMENTOS (ELETROZONE)
 * Gerencia a criação, edição, cálculo dinâmico de itens, fotos anexas, aprovação/reprovação direta e prévia A4.
 */

const quotes = {
  data: [],
  filtered: [],
  currentPreviewQuote: null,
  currentPhotos: [],

  async loadQuotes() {
    try {
      const res = await fetch('/api/quotes');
      const json = await res.json();
      if (json.success) {
        this.data = json.quotes || [];
        this.filter();
        this.renderRecentDashboard();
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro ao carregar orçamentos.', 'error');
    }
  },

  filter() {
    const search = (document.getElementById('quote-search-input')?.value || '').toLowerCase().trim();
    const status = document.getElementById('quote-status-filter')?.value || '';

    this.filtered = this.data.filter(q => {
      const matchSearch = !search ||
        (q.code || '').toLowerCase().includes(search) ||
        (q.clientName || '').toLowerCase().includes(search) ||
        (q.clientCpfCnpj || '').toLowerCase().includes(search) ||
        (q.clientCity || '').toLowerCase().includes(search);

      const matchStatus = !status || q.status === status;
      return matchSearch && matchStatus;
    });

    this.renderTable();
  },

  filterStatus(statusVal) {
    const select = document.getElementById('quote-status-filter');
    if (select) {
      select.value = statusVal;
      this.filter();
    }
  },

  renderTable() {
    const tbody = document.getElementById('quotes-table-body');
    if (!tbody) return;

    if (this.filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:2rem;">Nenhum orçamento encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.filtered.map(q => {
      const formattedTotal = Number(q.totalFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const formattedSubtotal = Number(q.subtotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const discText = q.discountPercentage > 0 ? `${q.discountPercentage}%` : '---';
      const photosCount = (q.photos && q.photos.length) ? `<span title="${q.photos.length} foto(s) anexa(s)"><i class="fa-solid fa-camera" style="color:var(--accent-red); margin-left:4px;"></i></span>` : '';

      let statusBadge = `<span class="badge badge-pending">🟡 Pendente</span>`;
      if (q.status === 'APROVADO') statusBadge = `<span class="badge badge-approved">🟢 Aprovado</span>`;
      if (q.status === 'REPROVADO') statusBadge = `<span class="badge badge-reprovado">🔴 Reprovado</span>`;
      if (q.status === 'CONVERTIDO') statusBadge = `<span class="badge badge-converted">🔵 Convertido</span>`;
      if (q.status === 'CANCELADO') statusBadge = `<span class="badge badge-canceled">⚪ Cancelado</span>`;

      return `
        <tr>
          <td><strong>${q.code}</strong> ${photosCount}</td>
          <td>
            <strong>${q.clientName}</strong>
            ${q.clientCpfCnpj ? `<br><small style="color:var(--text-muted);">${q.clientCpfCnpj}</small>` : ''}
          </td>
          <td>${q.clientWhatsapp ? `<a href="https://wa.me/55${q.clientWhatsapp.replace(/\D/g,'')}" target="_blank" style="color:#25d366; text-decoration:none;"><i class="fa-brands fa-whatsapp"></i> ${q.clientWhatsapp}</a>` : '---'}</td>
          <td>${formattedSubtotal}</td>
          <td>${discText}</td>
          <td><strong style="color:var(--text-primary); font-size:1rem;">${formattedTotal}</strong></td>
          <td>${statusBadge}</td>
          <td>
            <div class="action-btns">
              ${q.status !== 'APROVADO' && q.status !== 'CONVERTIDO' ? `<button class="btn btn-success btn-sm" onclick="quotes.quickStatus('${q.id}', 'APROVADO')" title="Marcar como Aprovado"><i class="fa-solid fa-check"></i> Aprovar</button>` : ''}
              ${q.status !== 'REPROVADO' && q.status !== 'CONVERTIDO' ? `<button class="btn btn-danger btn-sm" onclick="quotes.quickStatus('${q.id}', 'REPROVADO')" title="Marcar como Reprovado"><i class="fa-solid fa-xmark"></i> Reprovar</button>` : ''}
              <button class="btn btn-outline btn-sm" onclick="quotes.preview('${q.id}')" title="Visualizar / Imprimir"><i class="fa-solid fa-eye"></i></button>
              <button class="btn btn-outline btn-sm" onclick="quotes.openModal('${q.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
              ${q.status !== 'CONVERTIDO' ? `<button class="btn btn-secondary btn-sm" onclick="quotes.convertDirect('${q.id}')" title="Gerar Recibo"><i class="fa-solid fa-arrow-right-arrow-left"></i> Recibo</button>` : ''}
              <button class="btn btn-outline btn-sm" onclick="quotes.delete('${q.id}')" title="Excluir" style="color:#ef3636;"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderRecentDashboard() {
    const tbody = document.getElementById('dashboard-recent-quotes-table');
    if (!tbody) return;

    const recents = this.data.slice(0, 5);
    if (recents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Nenhum orçamento recente.</td></tr>`;
      return;
    }

    tbody.innerHTML = recents.map(q => {
      const formattedTotal = Number(q.totalFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      let statusBadge = `<span class="badge badge-pending">Pendente</span>`;
      if (q.status === 'APROVADO') statusBadge = `<span class="badge badge-approved">Aprovado</span>`;
      if (q.status === 'REPROVADO') statusBadge = `<span class="badge badge-reprovado">Reprovado</span>`;
      if (q.status === 'CONVERTIDO') statusBadge = `<span class="badge badge-converted">Convertido</span>`;

      return `
        <tr>
          <td><strong>${q.code}</strong></td>
          <td>${q.clientName}</td>
          <td>${q.clientCity || '---'}</td>
          <td><strong>${formattedTotal}</strong></td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="quotes.preview('${q.id}')"><i class="fa-solid fa-eye"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async quickStatus(quoteId, newStatus) {
    try {
      const res = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, user: auth.currentUser ? auth.currentUser.fullname : 'Operador' })
      });

      const data = await res.json();
      if (data.success) {
        const msg = newStatus === 'APROVADO' ? 'Orçamento marcado como APROVADO! 🟢' : 'Orçamento marcado como REPROVADO! 🔴';
        app.showToast(msg, newStatus === 'APROVADO' ? 'success' : 'error');
        this.loadQuotes();
        app.loadDashboardMetrics();
      } else {
        app.showToast(data.message || 'Erro ao alterar status.', 'error');
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro de requisição.', 'error');
    }
  },

  openModal(quoteId = null) {
    document.getElementById('quote-id').value = '';
    document.getElementById('quote-client-name').value = '';
    document.getElementById('quote-client-cpf-cnpj').value = '';
    document.getElementById('quote-client-address').value = '';
    document.getElementById('quote-client-city').value = '';
    document.getElementById('quote-client-email').value = '';
    document.getElementById('quote-client-whatsapp').value = '';
    document.getElementById('quote-discount-percentage').value = '0';
    document.getElementById('quote-status').value = 'PENDENTE';
    document.getElementById('quote-items-tbody').innerHTML = '';
    this.currentPhotos = [];

    document.getElementById('quote-modal-title').textContent = quoteId ? 'Editar Orçamento' : 'Novo Orçamento';

    if (quoteId) {
      const target = this.data.find(q => q.id === quoteId);
      if (target) {
        document.getElementById('quote-id').value = target.id;
        document.getElementById('quote-client-name').value = target.clientName || '';
        document.getElementById('quote-client-cpf-cnpj').value = target.clientCpfCnpj || '';
        document.getElementById('quote-client-address').value = target.clientAddress || '';
        document.getElementById('quote-client-city').value = target.clientCity || '';
        document.getElementById('quote-client-email').value = target.clientEmail || '';
        document.getElementById('quote-client-whatsapp').value = target.clientWhatsapp || '';
        document.getElementById('quote-discount-percentage').value = target.discountPercentage || 0;
        document.getElementById('quote-status').value = target.status || 'PENDENTE';
        this.currentPhotos = Array.isArray(target.photos) ? [...target.photos] : [];

        if (target.items && target.items.length > 0) {
          target.items.forEach(it => this.addItemRow(it));
        } else {
          this.addItemRow();
        }
      }
    } else {
      this.addItemRow();
    }

    this.renderPhotosGrid();
    this.recalculateTotals();
    document.getElementById('quote-modal').classList.add('active');
  },

  closeModal() {
    document.getElementById('quote-modal').classList.remove('active');
  },

  handlePhotoUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.currentPhotos.push(e.target.result);
        this.renderPhotosGrid();
      };
      reader.readAsDataURL(file);
    });

    event.target.value = '';
  },

  removePhoto(index) {
    this.currentPhotos.splice(index, 1);
    this.renderPhotosGrid();
  },

  renderPhotosGrid() {
    const grid = document.getElementById('quote-photos-grid');
    if (!grid) return;

    if (this.currentPhotos.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); font-size:0.8rem;">Nenhuma foto anexada a este orçamento.</div>`;
      return;
    }

    grid.innerHTML = this.currentPhotos.map((dataUrl, idx) => `
      <div class="photo-thumb-box">
        <img src="${dataUrl}" alt="Foto ${idx + 1}">
        <button type="button" class="photo-thumb-delete" onclick="quotes.removePhoto(${idx})" title="Remover foto"><i class="fa-solid fa-trash"></i></button>
      </div>
    `).join('');
  },

  addItemRow(itemData = null) {
    const tbody = document.getElementById('quote-items-tbody');
    const tr = document.createElement('tr');
    tr.className = 'quote-item-row';

    const qty = itemData ? itemData.quantity : 1;
    const desc = itemData ? itemData.description : '';
    const uPrice = itemData ? itemData.unitPrice : 0;
    const tPrice = qty * uPrice;

    tr.innerHTML = `
      <td>
        <input type="number" class="form-control item-qty" value="${qty}" min="0.1" step="any" oninput="quotes.recalculateTotals()">
      </td>
      <td>
        <input type="text" class="form-control item-desc" value="${desc}" placeholder="Descrição do equipamento, câmera, alarme, serviço...">
      </td>
      <td>
        <input type="number" class="form-control item-uprice" value="${uPrice}" min="0" step="0.01" oninput="quotes.recalculateTotals()">
      </td>
      <td>
        <input type="text" class="form-control item-tprice" value="R$ ${tPrice.toFixed(2)}" readonly style="background:rgba(255,255,255,0.02); text-align:right;">
      </td>
      <td>
        <button type="button" class="btn btn-outline btn-sm" onclick="quotes.removeItemRow(this)" style="color:#ef3636;"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;

    tbody.appendChild(tr);
    this.recalculateTotals();
  },

  removeItemRow(btn) {
    const tbody = document.getElementById('quote-items-tbody');
    if (tbody.children.length > 1) {
      btn.closest('tr').remove();
      this.recalculateTotals();
    } else {
      app.showToast('O orçamento deve possuir pelo menos 1 item.', 'info');
    }
  },

  recalculateTotals() {
    const rows = document.querySelectorAll('.quote-item-row');
    let subtotal = 0;

    rows.forEach(tr => {
      const qty = parseFloat(tr.querySelector('.item-qty').value) || 0;
      const uprice = parseFloat(tr.querySelector('.item-uprice').value) || 0;
      const total = qty * uprice;
      subtotal += total;

      tr.querySelector('.item-tprice').value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    });

    const discPercent = parseFloat(document.getElementById('quote-discount-percentage').value) || 0;
    const discountVal = subtotal * (discPercent / 100);
    const totalFinal = Math.max(0, subtotal - discountVal);

    document.getElementById('quote-calc-subtotal').textContent = subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('quote-calc-discount-val').textContent = `- ${discountVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    document.getElementById('quote-calc-total-final').textContent = totalFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  async save() {
    const id = document.getElementById('quote-id').value;
    const clientName = document.getElementById('quote-client-name').value.trim();
    const clientCpfCnpj = document.getElementById('quote-client-cpf-cnpj').value.trim();
    const clientAddress = document.getElementById('quote-client-address').value.trim();
    const clientCity = document.getElementById('quote-client-city').value.trim();
    const clientEmail = document.getElementById('quote-client-email').value.trim();
    const clientWhatsapp = document.getElementById('quote-client-whatsapp').value.trim();
    const discountPercentage = parseFloat(document.getElementById('quote-discount-percentage').value) || 0;
    const status = document.getElementById('quote-status').value || 'PENDENTE';

    if (!clientName) {
      app.showToast('Preencha o nome do cliente.', 'error');
      return;
    }

    const rows = document.querySelectorAll('.quote-item-row');
    const items = [];
    rows.forEach(tr => {
      const qty = parseFloat(tr.querySelector('.item-qty').value) || 0;
      const description = tr.querySelector('.item-desc').value.trim();
      const unitPrice = parseFloat(tr.querySelector('.item-uprice').value) || 0;
      if (description && qty > 0) {
        items.push({ quantity: qty, description, unitPrice });
      }
    });

    if (items.length === 0) {
      app.showToast('Adicione pelo menos um item válido com descrição.', 'error');
      return;
    }

    const payload = {
      clientName,
      clientCpfCnpj,
      clientAddress,
      clientCity,
      clientEmail,
      clientWhatsapp,
      discountPercentage,
      status,
      items,
      photos: this.currentPhotos,
      user: auth.currentUser ? auth.currentUser.fullname : 'Operador'
    };

    try {
      const url = id ? `/api/quotes/${id}` : '/api/quotes';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        app.showToast('Orçamento salvo com sucesso!', 'success');
        this.closeModal();
        this.loadQuotes();
        app.loadDashboardMetrics();
      } else {
        app.showToast(data.message || 'Erro ao salvar orçamento.', 'error');
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro ao comunicar com o servidor.', 'error');
    }
  },

  async delete(quoteId) {
    if (!confirm('Deseja realmente excluir este orçamento?')) return;

    try {
      const res = await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        app.showToast('Orçamento removido com sucesso.', 'info');
        this.loadQuotes();
        app.loadDashboardMetrics();
      } else {
        app.showToast(data.message || 'Erro ao excluir orçamento.', 'error');
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro de requisição.', 'error');
    }
  },

  preview(quoteId) {
    const q = this.data.find(item => item.id === quoteId);
    if (!q) return;

    this.currentPreviewQuote = q;
    app.currentDocument = { type: 'QUOTE', data: q };

    document.getElementById('preview-doc-title').textContent = `Orçamento - ${q.code}`;
    document.getElementById('doc-type-heading').textContent = 'Orçamento';
    document.getElementById('doc-code-lbl').textContent = 'ORÇAMENTO Nº:';
    document.getElementById('doc-code-val').textContent = q.code;
    document.getElementById('doc-date-val').textContent = q.createdAt ? new Date(q.createdAt).toLocaleDateString('pt-BR') : '---';

    // Preenche dados do cliente
    document.getElementById('doc-client-name').textContent = q.clientName || '---';
    document.getElementById('doc-client-cpf').textContent = q.clientCpfCnpj || '---';
    document.getElementById('doc-client-address').textContent = q.clientAddress || '---';
    document.getElementById('doc-client-city').textContent = q.clientCity || '---';
    document.getElementById('doc-client-email').textContent = q.clientEmail || '---';
    document.getElementById('doc-client-whatsapp').textContent = q.clientWhatsapp || '---';
    document.getElementById('doc-signature-client-name').textContent = q.clientName || 'Cliente';

    // Preenche a tabela de produtos
    const itemsTbody = document.getElementById('doc-items-tbody');
    itemsTbody.innerHTML = (q.items || []).map(it => `
      <tr>
        <td style="text-align:center;">${it.quantity}</td>
        <td>${it.description}</td>
        <td style="text-align:right;">${Number(it.unitPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td style="text-align:right;"><strong>${Number(it.totalPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
      </tr>
    `).join('');

    // Preenche totais
    document.getElementById('doc-subtotal-val').textContent = Number(q.subtotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('doc-discount-val').textContent = q.discountValue > 0 ? `- ${Number(q.discountValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${q.discountPercentage}%)` : 'R$ 0,00';
    document.getElementById('doc-total-final-val').textContent = Number(q.totalFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Esconde declaração de recibo
    document.getElementById('doc-declaration-container').style.display = 'none';

    // Exibe botão de converter em recibo na toolbar
    const btnConvert = document.getElementById('btn-convert-quote');
    if (btnConvert) btnConvert.style.display = q.status !== 'CONVERTIDO' ? 'inline-flex' : 'none';

    document.getElementById('document-preview-modal').classList.add('active');
  },

  async convertDirect(quoteId) {
    if (!confirm('Deseja converter este orçamento em recibo de pagamento agora?')) return;
    try {
      const res = await fetch(`/api/quotes/${quoteId}/convert-to-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: auth.currentUser ? auth.currentUser.fullname : 'Operador' })
      });

      const data = await res.json();
      if (data.success) {
        app.showToast(`Recibo ${data.receiptCode} gerado com sucesso!`, 'success');
        await this.loadQuotes();
        await receipts.loadReceipts();
        app.loadDashboardMetrics();
        receipts.preview(data.receiptId);
      } else {
        app.showToast(data.message || 'Erro ao converter orçamento.', 'error');
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro de requisição.', 'error');
    }
  },

  async convertCurrentToReceipt() {
    if (!this.currentPreviewQuote) return;
    app.closePreviewModal();
    await this.convertDirect(this.currentPreviewQuote.id);
  }
};
