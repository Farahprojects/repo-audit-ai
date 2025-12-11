import React from 'react';
import { Shield } from 'lucide-react';
import { ViewState } from '../../types';
import LegalDocumentPage from '../common/LegalDocumentPage';

interface PrivacyProps {
  onNavigate: (view: ViewState) => void;
}

const Privacy: React.FC<PrivacyProps> = ({ onNavigate }) => {
  return (
    <LegalDocumentPage
      onNavigate={onNavigate}
      mode="single"
      documentType="privacy"
      pageTitle="Privacy Policy"
      pageDescription="Learn how we collect, use, and protect your personal information."
      pageIcon={Shield}
    />
  );
};

export default Privacy;
