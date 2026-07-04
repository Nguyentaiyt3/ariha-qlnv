import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function generatePaymentProposalPDF(
  trialCode: string,
  trialTitle: string,
  paymentName: string,
  date: string,
  totalAmount: number,
  splits: {
    splitAriha?: number;
    splitDepartment?: number;
    splitSubUnit1?: number;
    splitSubUnit2?: number;
    splitFinance?: number;
    splitPharmacy?: number;
  },
  splitMode: 'percentage' | 'amount' = 'percentage',
  department?: string,
  submitterName?: string,
  submitterRole?: string
) {
  // Create HTML content
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 18px; font-weight: bold;">PHIẾU ĐỀ NGHỊ THANH TOÁN</h1>
        <h2 style="margin: 10px 0 0 0; font-size: 14px; font-weight: normal;">Thử nghiệm lâm sàng</h2>
      </div>

      <table style="width: 100%; margin-bottom: 20px; border-collapse: collapse;">
        <tr style="border: 1px solid #000;">
          <td style="padding: 8px; width: 30%; font-weight: bold;">Mã thử nghiệm:</td>
          <td style="padding: 8px; border-left: 1px solid #000;">${trialCode}</td>
        </tr>
        <tr style="border: 1px solid #000; border-top: none;">
          <td style="padding: 8px; font-weight: bold;">Tên thử nghiệm:</td>
          <td style="padding: 8px; border-left: 1px solid #000;">${trialTitle}</td>
        </tr>
        <tr style="border: 1px solid #000; border-top: none;">
          <td style="padding: 8px; font-weight: bold;">Khoa thực hiện:</td>
          <td style="padding: 8px; border-left: 1px solid #000;">${department || '—'}</td>
        </tr>
      </table>

      <h3 style="font-size: 14px; font-weight: bold; margin: 20px 0 10px 0;">Thông tin thanh toán</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="border: 1px solid #000; background-color: #f0f0f0;">
          <td style="padding: 8px; font-weight: bold; border-right: 1px solid #000;">Tên thanh toán</td>
          <td style="padding: 8px; font-weight: bold; border-right: 1px solid #000;">Ngày</td>
          <td style="padding: 8px; font-weight: bold;">Số tiền (VND)</td>
        </tr>
        <tr style="border: 1px solid #000; border-top: none;">
          <td style="padding: 8px; border-right: 1px solid #000;">${paymentName}</td>
          <td style="padding: 8px; border-right: 1px solid #000;">${new Date(date).toLocaleDateString('vi-VN')}</td>
          <td style="padding: 8px; text-align: right;">${totalAmount.toLocaleString('vi-VN')}</td>
        </tr>
      </table>

      <h3 style="font-size: 14px; font-weight: bold; margin: 20px 0 10px 0;">Phân chia chi phí</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="border: 1px solid #000; background-color: #f0f0f0;">
          <td style="padding: 8px; font-weight: bold; border-right: 1px solid #000; width: 40%;">Đơn vị/Bộ phận</td>
          <td style="padding: 8px; font-weight: bold; text-align: right;">
            ${splitMode === 'percentage' ? 'Phần trăm (%)' : 'Số tiền (VND)'}
          </td>
        </tr>
        ${splits.splitAriha ? `
        <tr style="border: 1px solid #000; border-top: none;">
          <td style="padding: 8px; border-right: 1px solid #000;">ARiHA</td>
          <td style="padding: 8px; text-align: right;">
            ${splitMode === 'percentage' ? `${splits.splitAriha}%` : splits.splitAriha?.toLocaleString('vi-VN')}
          </td>
        </tr>
        ` : ''}
        ${splits.splitDepartment ? `
        <tr style="border: 1px solid #000; border-top: none;">
          <td style="padding: 8px; border-right: 1px solid #000;">Khoa chủ trì</td>
          <td style="padding: 8px; text-align: right;">
            ${splitMode === 'percentage' ? `${splits.splitDepartment}%` : splits.splitDepartment?.toLocaleString('vi-VN')}
          </td>
        </tr>
        ` : ''}
        ${splits.splitSubUnit1 ? `
        <tr style="border: 1px solid #000; border-top: none;">
          <td style="padding: 8px; border-right: 1px solid #000;">Đơn vị phụ 1</td>
          <td style="padding: 8px; text-align: right;">
            ${splitMode === 'percentage' ? `${splits.splitSubUnit1}%` : splits.splitSubUnit1?.toLocaleString('vi-VN')}
          </td>
        </tr>
        ` : ''}
        ${splits.splitSubUnit2 ? `
        <tr style="border: 1px solid #000; border-top: none;">
          <td style="padding: 8px; border-right: 1px solid #000;">Đơn vị phụ 2</td>
          <td style="padding: 8px; text-align: right;">
            ${splitMode === 'percentage' ? `${splits.splitSubUnit2}%` : splits.splitSubUnit2?.toLocaleString('vi-VN')}
          </td>
        </tr>
        ` : ''}
        ${splits.splitFinance ? `
        <tr style="border: 1px solid #000; border-top: none;">
          <td style="padding: 8px; border-right: 1px solid #000;">Tài chính</td>
          <td style="padding: 8px; text-align: right;">
            ${splitMode === 'percentage' ? `${splits.splitFinance}%` : splits.splitFinance?.toLocaleString('vi-VN')}
          </td>
        </tr>
        ` : ''}
        ${splits.splitPharmacy ? `
        <tr style="border: 1px solid #000; border-top: none;">
          <td style="padding: 8px; border-right: 1px solid #000;">Dược</td>
          <td style="padding: 8px; text-align: right;">
            ${splitMode === 'percentage' ? `${splits.splitPharmacy}%` : splits.splitPharmacy?.toLocaleString('vi-VN')}
          </td>
        </tr>
        ` : ''}
      </table>

      <h3 style="font-size: 14px; font-weight: bold; margin: 30px 0 10px 0;">Phê duyệt</h3>
      <table style="width: 100%; margin-bottom: 30px;">
        <tr>
          <td style="text-align: center; padding: 40px 20px;">
            <div style="min-height: 50px; border-bottom: 1px solid #000;"></div>
            <div style="font-size: 12px; margin-top: 5px;">Người nộp đơn</div>
            <div style="font-size: 11px; color: #666;">${submitterName || '—'}</div>
          </td>
          <td style="text-align: center; padding: 40px 20px;">
            <div style="min-height: 50px; border-bottom: 1px solid #000;"></div>
            <div style="font-size: 12px; margin-top: 5px;">Trưởng đơn vị</div>
            <div style="font-size: 11px; color: #666;">_______________</div>
          </td>
          <td style="text-align: center; padding: 40px 20px;">
            <div style="min-height: 50px; border-bottom: 1px solid #000;"></div>
            <div style="font-size: 12px; margin-top: 5px;">Giám đốc</div>
            <div style="font-size: 11px; color: #666;">_______________</div>
          </td>
        </tr>
      </table>

      <div style="text-align: center; font-size: 11px; color: #666; margin-top: 20px;">
        <p>Phiếu đề nghị thanh toán được in lúc ${new Date().toLocaleString('vi-VN')}</p>
      </div>
    </div>
  `;

  // Create temporary container
  const container = document.createElement('div');
  container.innerHTML = htmlContent;
  container.style.position = 'absolute';
  container.style.left = '-10000px';
  container.style.top = '-10000px';
  container.style.background = 'white';
  document.body.appendChild(container);

  try {
    // Convert HTML to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    // Create PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/png');

    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

    // Download PDF
    const fileName = `TT_${trialCode}_${paymentName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(fileName);
  } finally {
    document.body.removeChild(container);
  }
}
