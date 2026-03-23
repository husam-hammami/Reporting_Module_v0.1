import os
import logging
import requests
import tempfile
import smtplib
from datetime import datetime, timedelta
try:
    from xhtml2pdf import pisa
except ImportError:
    pisa = None
from email.message import EmailMessage

# === EMAIL SETTINGS (loaded from config at send time) ===
from smtp_config import get_smtp_config

# === API ENDPOINTS ===
FCL_API = "http://127.0.0.1:5000/orders/fcl/archive/summary"
SCL_API = "http://127.0.0.1:5000/orders/scl/archive/summary"
MILA_API = "http://127.0.0.1:5000/orders/mila/archive/summary"

# === Logging Setup ===
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def fetch_summary(api_url):
    logger.info(f"📡 Fetching report from {api_url}")
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    try:
        response = requests.get(api_url, params={
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat()
        })
        response.raise_for_status()
        data = response.json()
        return data.get("summary", {}), start_date.date(), end_date.date()
    except Exception as e:
        logger.error(f"❌ Failed to fetch from {api_url}: {e}")
        return {}, start_date.date(), end_date.date()

def generate_pdf(title, html, pdf_path):
    if pisa is None:
        logger.warning(f"xhtml2pdf not available, skipping PDF generation for {title}")
        return
    try:
        with open(pdf_path, "wb") as f:
            pisa.CreatePDF(html, dest=f)
        logger.info(f"✅ PDF generated: {pdf_path}")
    except Exception as e:
        logger.error(f"❌ Failed to generate {title} PDF: {e}")

def html_fcl_scl(summary, start_date, end_date, label):
    total_prod = summary.get('total_produced_weight', 0.0)
    total_recv = summary.get('total_receiver_weight') or summary.get('receiver_weight') or summary.get('total_weight') or 0.0

    sender_rows = ''.join([
        f"<tr><td>{k.split('_')[-1]}</td><td>N/A</td><td>{v:.1f} kg</td></tr>"
        for k, v in summary.get("per_bin_weight_totals", {}).items()
    ])
    return f"""
    <html><head><style>
    @page {{ size: A4; margin: 15mm 12mm 15mm 12mm; }}
    body {{ font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1a1a2e; line-height: 1.5; }}
    h2 {{ font-size: 16pt; font-weight: bold; color: #0f3460; margin: 0 0 4pt 0; border-bottom: 2px solid #0f3460; padding-bottom: 4pt; }}
    h3 {{ font-size: 12pt; font-weight: bold; color: #1a5276; margin: 12pt 0 4pt 0; }}
    table {{ border-collapse: collapse; width: 100%; margin-bottom: 12pt; table-layout: fixed; }}
    th {{ border: 1px solid #9ca3af; padding: 5pt 6pt; background-color: #f1f5f9; font-weight: bold; font-size: 10pt; text-align: left; }}
    td {{ border: 1px solid #d1d5db; padding: 4pt 6pt; font-size: 11pt; word-break: break-word; }}
    tr:nth-child(even) td {{ background-color: #f8fafc; }}
    .summary-row td {{ font-weight: bold; background-color: #f1f5f9; }}
    p {{ font-size: 10pt; color: #64748b; margin: 4pt 0; }}
    </style></head><body>
    <h2>{label} Report</h2>
    <p style="font-size:10pt; color:#64748b; margin-bottom:8pt;">Period: {start_date} to {end_date}</p>
    <table>
      <tr>
        <th style="width:50%">Metric</th>
        <th style="width:50%">Value</th>
      </tr>
      <tr><td><b>Total Produced</b></td><td>{total_prod:.1f} kg</td></tr>
      <tr><td><b>Total Consumed</b></td><td>{total_recv:.1f} kg</td></tr>
    </table>
    <h3>Sender</h3>
    <table>
      <tr><th style="width:25%">ID</th><th style="width:45%">Product</th><th style="width:30%">Weight</th></tr>
      {sender_rows}
      <tr class="summary-row"><td colspan="2"><b>Total</b></td><td><b>{total_prod:.1f} kg</b></td></tr>
    </table>
    <h3>Receiver</h3>
    <table>
      <tr><th style="width:15%">ID</th><th style="width:20%">Code</th><th style="width:35%">Description</th><th style="width:30%">Weight</th></tr>
      <tr><td>0031</td><td>N/A</td><td>Output Bin</td><td>{total_recv:.1f} kg</td></tr>
    </table>
    <h3>Setpoints</h3>
    <table>
      <tr><th style="width:60%">Parameter</th><th style="width:40%">Value</th></tr>
      <tr><td>Flowrate</td><td>{summary.get('average_flow_rate', 'N/A')}</td></tr>
      <tr><td>Moisture Setpoint</td><td>15.3</td></tr>
      <tr><td>Moisture Offset</td><td>{summary.get('average_moisture_offset', 'N/A')}</td></tr>
    </table>
    <p><i>Total records: {summary.get('record_count', 0)}</i></p>
    </body></html>
    """

def html_mila(summary, start_date, end_date):
    receiver_rows = ''.join([
        f"<tr><td>{mat}</td><td>{mat}</td><td>{wt} kg</td></tr>"
        for mat, wt in summary.get("receiver_weight_totals", {}).items()
    ])
    bran_rows = ''.join([
        f"<tr><td>{mat}</td><td>{mat}</td><td>{wt} kg</td></tr>"
        for mat, wt in summary.get("bran_receiver_totals", {}).items()
    ])
    yield_log = summary.get("average_yield_log", {})
    setpoints = summary.get("average_setpoints_percentages", {})
    flow = summary.get("average_yield_flows", {})

    yield_rows = ''.join([f"<tr><td>{k}</td><td>{v}</td></tr>" for k, v in yield_log.items()])
    flow_rows = ''.join([f"<tr><td>{k}</td><td>{v}</td></tr>" for k, v in flow.items()])
    setpoint_rows = ''.join([f"<tr><td>{k}</td><td>{v}</td><td></td></tr>" for k, v in setpoints.items()])

    return f"""
    <html><head><style>
    @page {{ size: A4; margin: 15mm 12mm 15mm 12mm; }}
    body {{ font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1a1a2e; line-height: 1.5; }}
    h2 {{ font-size: 16pt; font-weight: bold; color: #0f3460; margin: 0 0 4pt 0; border-bottom: 2px solid #0f3460; padding-bottom: 4pt; }}
    h3 {{ font-size: 12pt; font-weight: bold; color: #1a5276; margin: 12pt 0 4pt 0; }}
    table {{ border-collapse: collapse; width: 100%; margin-bottom: 12pt; table-layout: fixed; }}
    th {{ border: 1px solid #9ca3af; padding: 5pt 6pt; background-color: #f1f5f9; font-weight: bold; font-size: 10pt; text-align: left; }}
    td {{ border: 1px solid #d1d5db; padding: 4pt 6pt; font-size: 11pt; word-break: break-word; }}
    tr:nth-child(even) td {{ background-color: #f8fafc; }}
    p {{ font-size: 10pt; color: #64748b; margin: 4pt 0; }}
    </style></head><body>
    <h2>MILA Report</h2>
    <p style="font-size:10pt; color:#64748b; margin-bottom:6pt;">Period: {start_date} to {end_date}</p>
    <p style="font-size:11pt;"><b>Total Produced:</b> {summary.get('total_produced_weight', 0.0):.1f} kg</p>
    <h3>Receiver</h3>
    <table>
      <tr><th style="width:35%">Material</th><th style="width:40%">Product Name</th><th style="width:25%">Actual Weight</th></tr>
      {receiver_rows}
    </table>
    <h3>Bran Receiver</h3>
    <table>
      <tr><th style="width:35%">Material</th><th style="width:40%">Product Name</th><th style="width:25%">Actual Weight</th></tr>
      {bran_rows}
    </table>
    <h3>Yield Log</h3>
    <table>
      <tr><th style="width:60%">Label</th><th style="width:40%">Value</th></tr>
      {flow_rows}{yield_rows}
    </table>
    <h3>Setpoints</h3>
    <table>
      <tr><th style="width:40%">Identification</th><th style="width:30%">Target Value</th><th style="width:30%">Actual Value</th></tr>
      {setpoint_rows}
    </table>
    <p><i>Total records: {summary.get('record_count', 0)}</i></p>
    </body></html>
    """

def run_combined_monthly_report():
    logger.info("🔔 Starting full monthly report process")
    attachments = []
    month_label = datetime.now().strftime("%B %Y")

    # FCL
    fcl_data, s, e = fetch_summary(FCL_API)
    if fcl_data:
        path = os.path.join(tempfile.gettempdir(), f"FCL_Report_{e}.pdf")
        generate_pdf("FCL", html_fcl_scl(fcl_data, s, e, "FCL"), path)
        attachments.append(("FCL_Report.pdf", path))

    # SCL
    scl_data, s, e = fetch_summary(SCL_API)
    if scl_data:
        path = os.path.join(tempfile.gettempdir(), f"SCL_Report_{e}.pdf")
        generate_pdf("SCL", html_fcl_scl(scl_data, s, e, "SCL"), path)
        attachments.append(("SCL_Report.pdf", path))

    # MILA
    mila_data, s, e = fetch_summary(MILA_API)
    if mila_data:
        path = os.path.join(tempfile.gettempdir(), f"MILA_Report_{e}.pdf")
        generate_pdf("MILA", html_mila(mila_data, s, e), path)
        attachments.append(("MILA_Report.pdf", path))

    send_email_with_attachments(attachments, month_label)

def send_email_with_attachments(files, label):
    logger.info("📤 Sending email with all reports...")
    cfg = get_smtp_config()
    EMAIL_USER = cfg.get('username', '')
    EMAIL_PASS = cfg.get('password', '')
    EMAIL_RECIPIENT = cfg.get('recipient', '')

    msg = EmailMessage()
    msg['Subject'] = f'Monthly Production Reports - {label}'
    msg['From'] = cfg.get('from_address') or EMAIL_USER
    msg['To'] = EMAIL_RECIPIENT
    msg.set_content(f"Attached are the monthly reports for {label}.\n\n- FCL\n- SCL\n- MILA")

    for filename, path in files:
        try:
            with open(path, 'rb') as f:
                msg.add_attachment(f.read(), maintype='application', subtype='pdf', filename=filename)
            logger.info(f"📎 Attached: {filename}")
        except Exception as e:
            logger.error(f"❌ Failed to attach {filename}: {e}")

    try:
        smtp_server = cfg.get('smtp_server', 'smtp.gmail.com')
        smtp_port = cfg.get('smtp_port', 465)
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_server, smtp_port) as smtp:
                smtp.login(EMAIL_USER, EMAIL_PASS)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(smtp_server, smtp_port) as smtp:
                smtp.starttls()
                smtp.login(EMAIL_USER, EMAIL_PASS)
                smtp.send_message(msg)
        logger.info("✅ Email with all PDFs sent.")
    except Exception as e:
        logger.error(f"❌ Failed to send email: {e}")
