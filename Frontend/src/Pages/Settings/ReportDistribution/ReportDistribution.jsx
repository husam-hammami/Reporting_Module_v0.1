import React from 'react';
import SmtpSection from './SmtpSection';
import DistributionRules from './DistributionRules';

export default function ReportDistribution() {
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <SmtpSection />
        <DistributionRules />
      </div>
    </div>
  );
}
