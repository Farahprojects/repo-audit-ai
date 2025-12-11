import React from 'react';
import { FileText } from 'lucide-react';
import { ViewState } from '../../types';
import LegalDocumentPage from '../common/LegalDocumentPage';

interface TermsProps {
  onNavigate: (view: ViewState) => void;
}

const Terms: React.FC<TermsProps> = ({ onNavigate }) => {
  return (
    <LegalDocumentPage
      onNavigate={onNavigate}
      mode="single"
      documentType="terms"
      pageTitle="Terms of Service"
      pageDescription="Please read these terms carefully before using our service."
      pageIcon={FileText}
    />
  );
};

export default Terms;
