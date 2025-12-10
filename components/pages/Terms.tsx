import React, { useState, useEffect } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { FileText, ArrowLeft } from 'lucide-react';
import { ViewState } from '../../types';
import { sanitizeLegalContent } from '../../utils/contentSanitization';

interface TermsProps {
  onNavigate: (view: ViewState) => void;
}

interface LegalDocument {
  id: string;
  type: 'privacy' | 'terms';
  title: string;
  content: string;
  last_updated: string;
}

const Terms: React.FC<TermsProps> = ({ onNavigate }) => {
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTermsOfService();
  }, []);

  const fetchTermsOfService = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('legal')
        .select('*')
        .eq('type', 'terms')
        .single();

      if (error) throw error;
      setDocument(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load terms of service');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white pt-32 pb-12">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            <span className="ml-3 text-lg text-slate-600">Loading terms of service...</span>
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
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Error Loading Terms of Service</h2>
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
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-8 h-8 text-slate-600" />
            <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
          </div>
          <p className="text-slate-600">
            Please read these terms carefully before using our service.
          </p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {document ? (
            <div>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <h2 className="text-2xl font-bold text-slate-900">{document.title}</h2>
                <span className="text-sm text-slate-500">
                  Last updated: {new Date(document.last_updated).toLocaleDateString()}
                </span>
              </div>

              <div className="prose prose-slate max-w-none">
                <div
                  dangerouslySetInnerHTML={{
                    __html: sanitizeLegalContent(document.content)
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500">Terms of service not found</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Terms;
