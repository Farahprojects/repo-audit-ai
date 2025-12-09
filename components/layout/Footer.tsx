import React from 'react';
import { Github, Twitter, Linkedin } from 'lucide-react';
import { ViewState } from '../../types';

interface FooterProps {
  onNavigate: (view: ViewState) => void;
}

const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-white border-t border-slate-100 pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              <img
                src="/favicon-192x192.png"
                alt="SCAI Logo"
                className="w-8 h-8"
              />
              <span className="text-slate-900 font-bold text-lg">SCAI</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              The AI-powered senior engineer that audits your code 24/7.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-slate-900 font-bold mb-6">Product</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><button onClick={() => onNavigate('landing')} className="hover:text-slate-700 transition-colors">Features</button></li>
              <li><button onClick={() => onNavigate('pricing')} className="hover:text-slate-700 transition-colors">Pricing</button></li>
              <li><button onClick={() => onNavigate('landing')} className="hover:text-slate-700 transition-colors">Integrations</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-slate-900 font-bold mb-6">Company</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><button onClick={() => onNavigate('about')} className="hover:text-slate-700 transition-colors">Mission</button></li>
              <li><button onClick={() => onNavigate('about')} className="hover:text-slate-700 transition-colors">Careers</button></li>
              <li><button onClick={() => onNavigate('contact')} className="hover:text-slate-700 transition-colors">Contact</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-slate-900 font-bold mb-6">Legal</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><button onClick={() => onNavigate('privacy')} className="hover:text-slate-700 transition-colors">Privacy</button></li>
              <li><button onClick={() => onNavigate('terms')} className="hover:text-slate-700 transition-colors">Terms</button></li>
              <li><button onClick={() => onNavigate('legal')} className="hover:text-slate-700 transition-colors">Legal</button></li>
            </ul>
          </div>

        </div>

        <div className="border-t border-slate-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-400 text-sm font-medium">
            © {new Date().getFullYear()} SCAI Inc.
          </p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Systems Normal</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;