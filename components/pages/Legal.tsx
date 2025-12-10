import React, { useState, useEffect } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { FileText, Shield, ArrowLeft } from 'lucide-react';
import { ViewState } from '../../types';
import { sanitizeLegalContent } from '../../utils/contentSanitization';

interface LegalProps {
  onNavigate: (view: ViewState) => void;
}

interface LegalDocument {
  id: string;
  type: 'privacy' | 'terms';
  title: string;
  content: string;
  last_updated: string;
}

const Legal: React.FC<LegalProps> = ({ onNavigate }) => {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>('privacy');

  useEffect(() => {
    fetchLegalDocuments();
  }, []);

  const fetchLegalDocuments = async () => {
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

  const activeDocument = documents.find(doc => doc.type === activeTab);

  if (loading) {
    return (
      <div className="min-h-screen bg-white pt-32 pb-12">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            <span className="ml-3 text-lg text-slate-600">Loading legal documents...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white pt-32 pb-12">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <FileText className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Error Loading Documents</h2>
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
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Legal Documents</h1>
          <p className="text-slate-600">
            Review our privacy policy and terms of service.
          </p>
        </div>

        {/* Tab Navigation */}
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

          {/* Document Content */}
          <div className="p-8">
            {activeDocument ? (
              <div>
                <div className="flex items-center justify-between mb-6">
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
                <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-500">Document not found</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Legal;
