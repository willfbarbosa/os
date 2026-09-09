/**
 * PRINCIPAL CONTROLES DA APLICAÇÃO SPA (ELETROZONE)
 * Orquestra abas, dashboard, auditoria, toasts, exportação PDF e envio via WhatsApp.
 */

const app = {
  currentDocument: null, // { type: 'QUOTE' | 'RECEIPT', data: object }

  init() {
    auth.init();
    this.loadDashboardMetrics();
    quotes.loadQuotes();
    receipts.loadReceipts();
  },

  toggleMobileMenu() {
    const sidebar = document.getElementById('app-sidebar');
    let backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) {
      const isOpen = sidebar.classList.toggle('mobile-open');
      if (isOpen) {
        if (!backdrop) {
          backdrop = document.createElement('div');
          backdrop.id = 'sidebar-backdrop';
          backdrop.className = 'sidebar-backdrop';
          backdrop.onclick = () => this.toggleMobileMenu();
          document.body.appendChild(backdrop);
        }
        backdrop.classList.add('active');
      } else {
        if (backdrop) backdrop.classList.remove('active');
      }
    }
  },

  switchTab(tabName) {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');

    document.querySelectorAll('.tab-page').forEach(page => {
      page.style.display = 'none';
      page.classList.remove('active');
    });

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.remove('active');
    });

    const selectedTab = document.getElementById(`tab-${tabName}`);
    if (selectedTab) {
      selectedTab.style.display = 'block';
      selectedTab.classList.add('active');
    }

    const navBtn = document.querySelector(`.nav-item[onclick*="${tabName}"]`);
    if (navBtn) navBtn.classList.add('active');

    if (tabName === 'dashboard') {
      this.loadDashboardMetrics();
    } else if (tabName === 'users') {
      auth.loadUsers();
    } else if (tabName === 'logs') {
      this.loadLogs();
    }
  },

  async loadDashboardMetrics() {
    try {
      const res = await fetch('/api/metrics');
      const data = await res.json();
      if (data.success) {
        const m = data.metrics;
        document.getElementById('metric-total-quotes').textContent = m.totalQuotes;
        document.getElementById('metric-total-receipts').textContent = m.totalReceipts;
        document.getElementById('metric-total-revenue').textContent = Number(m.totalRevenue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('metric-pending-quotes').textContent = m.pendingQuotes;
      }
    } catch (err) {
      console.error(err);
    }
  },

  async loadLogs() {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.success) {
        const tbody = document.getElementById('logs-table-body');
        if (!tbody) return;

        if (data.logs.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Nenhum log registrado.</td></tr>`;
          return;
        }

        tbody.innerHTML = data.logs.map(l => {
          const dateStr = l.timestamp ? new Date(l.timestamp).toLocaleString('pt-BR') : '---';
          return `
            <tr>
              <td><small>${dateStr}</small></td>
              <td><span class="badge badge-converted">${l.type}</span></td>
              <td><strong>${l.action}</strong></td>
              <td>${l.user}</td>
              <td>${l.description}</td>
            </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error(err);
    }
  },

  async clearLogs() {
    if (!confirm('Deseja realmente limpar todos os logs de auditoria?')) return;
    try {
      const res = await fetch('/api/logs', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        this.showToast('Logs de auditoria zerados.', 'info');
        this.loadLogs();
      }
    } catch (err) {
      console.error(err);
    }
  },

  closePreviewModal() {
    document.getElementById('document-preview-modal').classList.remove('active');
  },

  // GERAÇÃO E DOWNLOAD DO ARQUIVO PDF LIMPO
  async downloadPdf() {
    if (!this.currentDocument) return;

    const element = document.getElementById('a4-paper-content');
    const doc = this.currentDocument.data;
    const filename = `${this.currentDocument.type === 'QUOTE' ? 'Orcamento' : 'Recibo'}_${doc.code || 'EletroZone'}.pdf`;

    this.showToast('Gerando arquivo PDF...', 'info');

    const opt = {
      margin: [8, 8, 8, 8],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      await html2pdf().set(opt).from(element).save();
      this.showToast('PDF baixado com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      this.showToast('Erro ao gerar arquivo PDF.', 'error');
    }
  },

  // COMPARTILHAR WHATSAPP ENVIANDO ARQUIVO PDF OU LINK
  async shareWhatsapp() {
    if (!this.currentDocument) return;

    const element = document.getElementById('a4-paper-content');
    const doc = this.currentDocument.data;
    const isQuote = this.currentDocument.type === 'QUOTE';
    const docType = isQuote ? 'Orçamento' : 'Recibo';
    const filename = `${docType}_${doc.code || 'EletroZone'}.pdf`;
    const totalFormatted = Number(doc.totalFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    let messageText = `*EletroZone - Segurança Eletrônica*\n`;
    messageText += `*${docType} Nº:* ${doc.code}\n`;
    messageText += `*Cliente:* ${doc.clientName}\n`;
    messageText += `*Valor Total:* ${totalFormatted}\n\n`;
    messageText += `Segue em anexo o arquivo PDF do ${docType.toLowerCase()}.\n`;
    messageText += `Dúvidas, estamos à disposição: (19) 98138-9982.`;

    const phone = doc.clientWhatsapp ? doc.clientWhatsapp.replace(/\D/g, '') : '';
    const whatsappUrl = phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(messageText)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(messageText)}`;

    const opt = {
      margin: [8, 8, 8, 8],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      this.showToast('Gerando PDF para compartilhamento...', 'info');
      const pdfBlob = await html2pdf().set(opt).from(element).output('blob');
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      // Se o navegador no celular suportar envio direto de arquivo Web Share API
      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: `${docType} ${doc.code} - EletroZone`,
          text: messageText
        });
        this.showToast('PDF compartilhado!', 'success');
        return;
      }
    } catch (err) {
      console.warn('Web Share API não suportada ou cancelada:', err);
    }

    // Fallback Desktop: Baixa o PDF e abre a conversa no WhatsApp para o usuário anexar
    try {
      await html2pdf().set(opt).from(element).save();
      this.showToast('O PDF foi baixado! Anexe o arquivo na conversa do WhatsApp.', 'info');
      setTimeout(() => {
        window.open(whatsappUrl, '_blank');
      }, 1000);
    } catch (err) {
      window.open(whatsappUrl, '_blank');
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-circle-exclamation"></i>';

    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

window.addEventListener('DOMContentLoaded', () => app.init());
