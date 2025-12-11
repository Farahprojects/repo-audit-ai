import React, { useState, useEffect } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { FileText, Shield, ArrowLeft } from 'lucide-react';
import { ViewState } from '../../types';
import { sanitizeLegalContent } from '../../utils/contentSanitization';

export interface LegalDocument {
  id: string;
  type: 'privacy' | 'terms';
  title: string;
  content: string;
  last_updated: string;
}

interface LegalDocumentPageProps {
  onNavigate: (view: ViewState) => void;
  mode: 'single' | 'tabbed';
  documentType?: 'privacy' | 'terms'; // Required when mode is 'single'
  pageTitle?: string;
  pageDescription?: string;
  pageIcon?: React.ComponentType<{ className?: string }>;
}

const LegalDocumentPage: React.FC<LegalDocumentPageProps> = ({
  onNavigate,
  mode,
  documentType,
  pageTitle,
  pageDescription,
  pageIcon: PageIcon
}) => {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(documentType || 'privacy');

  useEffect(() => {
    if (mode === 'single' && documentType) {
      fetchSingleDocument(documentType);
    } else if (mode === 'tabbed') {
      fetchAllDocuments();
    }
  }, [mode, documentType]);

  const fetchSingleDocument = async (type: 'privacy' | 'terms') => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('legal')
        .select('*')
        .eq('type', type)
        .single();

      if (error) throw error;
      setDocuments(data ? [data] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${type} document`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllDocuments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('legal')
        .select('*')
        .order('type');

      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load legal documents');
    } finally {
      setLoading(false);
    }
  };

  const getActiveDocument = () => {
    return documents.find(doc => doc.type === activeTab);
  };

  const getPageTitle = () => {
    if (pageTitle) return pageTitle;
    if (mode === 'single') {
      return activeTab === 'privacy' ? 'Privacy Policy' : 'Terms of Service';
    }
    return 'Legal Documents';
  };

  const getPageDescription = () => {
    if (pageDescription) return pageDescription;
    if (mode === 'single') {
      return activeTab === 'privacy'
        ? 'Learn how we collect, use, and protect your personal information.'
        : 'Please read these terms carefully before using our service.';
    }
    return 'Review our privacy policy and terms of service.';
  };

  const getPageIcon = () => {
    if (PageIcon) return PageIcon;
    if (mode === 'single') {
      return activeTab === 'privacy' ? Shield : FileText;
    }
    return FileText;
  };

  const getLoadingMessage = () => {
    if (mode === 'single') {
      return `Loading ${activeTab === 'privacy' ? 'privacy policy' : 'terms of service'}...`;
    }
    return 'Loading legal documents...';
  };

  const getErrorTitle = () => {
    if (mode === 'single') {
      return `Error Loading ${activeTab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}`;
    }
    return 'Error Loading Documents';
  };

  const getNotFoundMessage = () => {
    if (mode === 'single') {
      return `${activeTab === 'privacy' ? 'Privacy policy' : 'Terms of service'} not found`;
    }
    return 'Document not found';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white pt-32 pb-12">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            <span className="ml-3 text-lg text-slate-600">{getLoadingMessage()}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const IconComponent = getPageIcon();
    return (
      <div className="min-h-screen bg-white pt-32 pb-12">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <IconComponent className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-900 mb-2">{getErrorTitle()}</h2>
              <p className="text-slate-500">{error}</p>
              <button
                onClick={() => onNavigate('landing')}
                className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-full hover:bg-slate-800 transition-colors"
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeDocument = getActiveDocument();
  const IconComponent = getPageIcon();

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-6">

        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
          <div className="flex items-center gap-3 mb-2">
            <IconComponent className="w-8 h-8 text-slate-600" />
            <h1 className="text-3xl font-bold text-slate-900">{getPageTitle()}</h1>
          </div>
          <p className="text-slate-600">
            {getPageDescription()}
          </p>
        </div>

        {/* Tab Navigation (only for tabbed mode) */}
        {mode === 'tabbed' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-8">
            <div className="border-b border-slate-100">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('privacy')}
                  className={`flex-1 px-6 py-4 text-center font-medium transition-colors flex items-center justify-center gap-2 ${
                    activeTab === 'privacy'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Privacy Policy
                </button>
                <button
                  onClick={() => setActiveTab('terms')}
                  className={`flex-1 px-6 py-4 text-center font-medium transition-colors flex items-center justify-center gap-2 ${
                    activeTab === 'terms'
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Terms of Service
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${mode === 'tabbed' ? 'p-8' : ''}`}>
          {activeDocument ? (
            <div>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <h2 className="text-2xl font-bold text-slate-900">{activeDocument.title}</h2>
                <span className="text-sm text-slate-500">
                  Last updated: {new Date(activeDocument.last_updated).toLocaleDateString()}
                </span>
              </div>

              <div className="prose prose-slate max-w-none">
                <div
                  dangerouslySetInnerHTML={{
                    __html: sanitizeLegalContent(activeDocument.content)
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <IconComponent className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500">{getNotFoundMessage()}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default LegalDocumentPage;
