from apscheduler.schedulers.background import BackgroundScheduler
from report_mailer import run_combined_monthly_report


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(run_combined_monthly_report, 'interval', seconds=60)
    scheduler.start()
