import React from 'react';
import { FileText } from 'lucide-react';
import { ViewState } from '../../types';
import LegalDocumentPage from '../common/LegalDocumentPage';

interface LegalProps {
  onNavigate: (view: ViewState) => void;
}

const Legal: React.FC<LegalProps> = ({ onNavigate }) => {
  return (
    <LegalDocumentPage
      onNavigate={onNavigate}
      mode="tabbed"
      pageTitle="Legal Documents"
      pageDescription="Review our privacy policy and terms of service."
      pageIcon={FileText}
    />
  );
};

export default Legal;
