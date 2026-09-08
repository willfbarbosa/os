/**
 * MÓDULO DE RECIBOS (ELETROZONE)
 * Gerencia a criação, edição e prévia A4 do recibo com declaração oficial de recebimento.
 */

const receipts = {
  data: [],
  filtered: [],

  async loadReceipts() {
    try {
      const res = await fetch('/api/receipts');
      const json = await res.json();
      if (json.success) {
        this.data = json.receipts || [];
        this.filter();
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro ao carregar recibos.', 'error');
    }
  },

  filter() {
    const search = (document.getElementById('receipt-search-input')?.value || '').toLowerCase().trim();

    this.filtered = this.data.filter(r => {
      return !search ||
        (r.code || '').toLowerCase().includes(search) ||
        (r.clientName || '').toLowerCase().includes(search) ||
        (r.clientCpfCnpj || '').toLowerCase().includes(search) ||
        (r.clientCity || '').toLowerCase().includes(search);
    });

    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('receipts-table-body');
    if (!tbody) return;

    if (this.filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">Nenhum recibo emitido.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.filtered.map(r => {
      const formattedTotal = Number(r.totalFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const dateFormatted = r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : '---';

      return `
        <tr>
          <td><strong>${r.code}</strong></td>
          <td>
            <strong>${r.clientName}</strong>
            ${r.clientCity ? `<br><small style="color:var(--text-muted);">${r.clientCity}</small>` : ''}
          </td>
          <td><code>${r.clientCpfCnpj || '---'}</code></td>
          <td>${r.clientWhatsapp ? `<a href="https://wa.me/55${r.clientWhatsapp.replace(/\D/g,'')}" target="_blank" style="color:#25d366; text-decoration:none;"><i class="fa-brands fa-whatsapp"></i> ${r.clientWhatsapp}</a>` : '---'}</td>
          <td><strong style="color:#10b981; font-size:1rem;">${formattedTotal}</strong></td>
          <td>${dateFormatted}</td>
          <td>
            <div class="action-btns">
              <button class="btn btn-outline btn-sm" onclick="receipts.preview('${r.id}')" title="Visualizar / Imprimir"><i class="fa-solid fa-eye"></i></button>
              <button class="btn btn-outline btn-sm" onclick="receipts.openModal('${r.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-outline btn-sm" onclick="receipts.delete('${r.id}')" title="Excluir" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openModal(receiptId = null) {
    document.getElementById('receipt-id').value = '';
    document.getElementById('receipt-quote-id').value = '';
    document.getElementById('receipt-client-name').value = '';
    document.getElementById('receipt-client-cpf-cnpj').value = '';
    document.getElementById('receipt-client-address').value = '';
    document.getElementById('receipt-client-city').value = '';
    document.getElementById('receipt-client-email').value = '';
    document.getElementById('receipt-client-whatsapp').value = '';
    document.getElementById('receipt-discount-percentage').value = '0';
    document.getElementById('receipt-items-tbody').innerHTML = '';

    document.getElementById('receipt-modal-title').textContent = receiptId ? 'Editar Recibo' : 'Novo Recibo';

    if (receiptId) {
      const target = this.data.find(r => r.id === receiptId);
      if (target) {
        document.getElementById('receipt-id').value = target.id;
        document.getElementById('receipt-quote-id').value = target.quoteId || '';
        document.getElementById('receipt-client-name').value = target.clientName || '';
        document.getElementById('receipt-client-cpf-cnpj').value = target.clientCpfCnpj || '';
        document.getElementById('receipt-client-address').value = target.clientAddress || '';
        document.getElementById('receipt-client-city').value = target.clientCity || '';
        document.getElementById('receipt-client-email').value = target.clientEmail || '';
        document.getElementById('receipt-client-whatsapp').value = target.clientWhatsapp || '';
        document.getElementById('receipt-discount-percentage').value = target.discountPercentage || 0;

        if (target.items && target.items.length > 0) {
          target.items.forEach(it => this.addItemRow(it));
        } else {
          this.addItemRow();
        }
      }
    } else {
      this.addItemRow();
    }

    this.recalculateTotals();
    document.getElementById('receipt-modal').classList.add('active');
  },

  closeModal() {
    document.getElementById('receipt-modal').classList.remove('active');
  },

  addItemRow(itemData = null) {
    const tbody = document.getElementById('receipt-items-tbody');
    const tr = document.createElement('tr');
    tr.className = 'receipt-item-row';

    const qty = itemData ? itemData.quantity : 1;
    const desc = itemData ? itemData.description : '';
    const uPrice = itemData ? itemData.unitPrice : 0;
    const tPrice = qty * uPrice;

    tr.innerHTML = `
      <td>
        <input type="number" class="form-control item-qty" value="${qty}" min="0.1" step="any" oninput="receipts.recalculateTotals()">
      </td>
      <td>
        <input type="text" class="form-control item-desc" value="${desc}" placeholder="Descrição do serviço executado ou produto...">
      </td>
      <td>
        <input type="number" class="form-control item-uprice" value="${uPrice}" min="0" step="0.01" oninput="receipts.recalculateTotals()">
      </td>
      <td>
        <input type="text" class="form-control item-tprice" value="R$ ${tPrice.toFixed(2)}" readonly style="background:rgba(255,255,255,0.02); text-align:right;">
      </td>
      <td>
        <button type="button" class="btn btn-outline btn-sm" onclick="receipts.removeItemRow(this)" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;

    tbody.appendChild(tr);
    this.recalculateTotals();
  },

  removeItemRow(btn) {
    const tbody = document.getElementById('receipt-items-tbody');
    if (tbody.children.length > 1) {
      btn.closest('tr').remove();
      this.recalculateTotals();
    } else {
      app.showToast('O recibo deve possuir pelo menos 1 item.', 'info');
    }
  },

  recalculateTotals() {
    const rows = document.querySelectorAll('.receipt-item-row');
    let subtotal = 0;

    rows.forEach(tr => {
      const qty = parseFloat(tr.querySelector('.item-qty').value) || 0;
      const uprice = parseFloat(tr.querySelector('.item-uprice').value) || 0;
      const total = qty * uprice;
      subtotal += total;

      tr.querySelector('.item-tprice').value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    });

    const discPercent = parseFloat(document.getElementById('receipt-discount-percentage').value) || 0;
    const discountVal = subtotal * (discPercent / 100);
    const totalFinal = Math.max(0, subtotal - discountVal);

    document.getElementById('receipt-calc-subtotal').textContent = subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('receipt-calc-discount-val').textContent = `- ${discountVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    document.getElementById('receipt-calc-total-final').textContent = totalFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  async save() {
    const id = document.getElementById('receipt-id').value;
    const quoteId = document.getElementById('receipt-quote-id').value;
    const clientName = document.getElementById('receipt-client-name').value.trim();
    const clientCpfCnpj = document.getElementById('receipt-client-cpf-cnpj').value.trim();
    const clientAddress = document.getElementById('receipt-client-address').value.trim();
    const clientCity = document.getElementById('receipt-client-city').value.trim();
    const clientEmail = document.getElementById('receipt-client-email').value.trim();
    const clientWhatsapp = document.getElementById('receipt-client-whatsapp').value.trim();
    const discountPercentage = parseFloat(document.getElementById('receipt-discount-percentage').value) || 0;

    if (!clientName) {
      app.showToast('Preencha o nome do cliente.', 'error');
      return;
    }

    const rows = document.querySelectorAll('.receipt-item-row');
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
      quoteId,
      clientName,
      clientCpfCnpj,
      clientAddress,
      clientCity,
      clientEmail,
      clientWhatsapp,
      discountPercentage,
      items,
      user: auth.currentUser ? auth.currentUser.fullname : 'Operador'
    };

    try {
      const url = id ? `/api/receipts/${id}` : '/api/receipts';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        app.showToast('Recibo salvo com sucesso!', 'success');
        this.closeModal();
        this.loadReceipts();
        app.loadDashboardMetrics();
      } else {
        app.showToast(data.message || 'Erro ao salvar recibo.', 'error');
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro ao comunicar com o servidor.', 'error');
    }
  },

  async delete(receiptId) {
    if (!confirm('Deseja realmente excluir este recibo?')) return;

    try {
      const res = await fetch(`/api/receipts/${receiptId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        app.showToast('Recibo removido com sucesso.', 'info');
        this.loadReceipts();
        app.loadDashboardMetrics();
      } else {
        app.showToast(data.message || 'Erro ao excluir recibo.', 'error');
      }
    } catch (err) {
      console.error(err);
      app.showToast('Erro de requisição.', 'error');
    }
  },

  preview(receiptId) {
    const r = this.data.find(item => item.id === receiptId);
    if (!r) return;

    app.currentDocument = { type: 'RECEIPT', data: r };

    document.getElementById('preview-doc-title').textContent = `Recibo - ${r.code}`;
    document.getElementById('doc-type-heading').textContent = 'Recibo';
    document.getElementById('doc-code-lbl').textContent = 'RECIBO Nº:';
    document.getElementById('doc-code-val').textContent = r.code;
    document.getElementById('doc-date-val').textContent = r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : '---';

    // Preenche dados do cliente
    document.getElementById('doc-client-name').textContent = r.clientName || '---';
    document.getElementById('doc-client-cpf').textContent = r.clientCpfCnpj || '---';
    document.getElementById('doc-client-address').textContent = r.clientAddress || '---';
    document.getElementById('doc-client-city').textContent = r.clientCity || '---';
    document.getElementById('doc-client-email').textContent = r.clientEmail || '---';
    document.getElementById('doc-client-whatsapp').textContent = r.clientWhatsapp || '---';
    document.getElementById('doc-signature-client-name').textContent = r.clientName || 'Cliente';

    // Preenche a tabela de produtos
    const itemsTbody = document.getElementById('doc-items-tbody');
    itemsTbody.innerHTML = (r.items || []).map(it => `
      <tr>
        <td style="text-align:center;">${it.quantity}</td>
        <td>${it.description}</td>
        <td style="text-align:right;">${Number(it.unitPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td style="text-align:right;"><strong>${Number(it.totalPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
      </tr>
    `).join('');

    // Preenche totais
    document.getElementById('doc-subtotal-val').textContent = Number(r.subtotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('doc-discount-val').textContent = r.discountValue > 0 ? `- ${Number(r.discountValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${r.discountPercentage}%)` : 'R$ 0,00';
    document.getElementById('doc-total-final-val').textContent = Number(r.totalFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Preenche o texto de declaração exato solicitado pelo usuário
    const formattedTotal = Number(r.totalFinal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const declText = `Declaro aos devidos fins, que recebi a contia de R$ ${formattedTotal} de ${r.clientName || 'Cliente'} portador do cpf/cnpj ${r.clientCpfCnpj || '---'}, referente a serviços prestados descritos a cima.`;
    
    document.getElementById('doc-declaration-text').textContent = r.declarationText || declText;
    document.getElementById('doc-declaration-container').style.display = 'block';

    // Esconde o botão de conversão (pois já é recibo)
    const btnConvert = document.getElementById('btn-convert-quote');
    if (btnConvert) btnConvert.style.display = 'none';

    document.getElementById('document-preview-modal').classList.add('active');
  }
};
