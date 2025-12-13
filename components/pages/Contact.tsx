import React from 'react';
import { Send } from 'lucide-react';

const Contact: React.FC = () => {
  return (
    <div className="min-h-screen pt-32 pb-20 px-4 md:px-6 bg-white">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">Get in touch</h1>
          <p className="text-xl text-slate-500 leading-relaxed">
            Have a question about enterprise pricing? Found a bug?
            We'd love to hear from you.
          </p>
        </div>

        {/* Contact Form */}
        <div className="bg-slate-50 border border-slate-100 p-8 md:p-10 rounded-[2.5rem]">
          <form className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                className="w-full bg-white border border-slate-200 rounded-full px-6 py-4 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                placeholder="First Name"
              />
              <input
                type="text"
                className="w-full bg-white border border-slate-200 rounded-full px-6 py-4 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                placeholder="Last Name"
              />
            </div>

            <input
              type="email"
              className="w-full bg-white border border-slate-200 rounded-full px-6 py-4 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
              placeholder="Email Address"
            />

            <textarea
              rows={6}
              className="w-full bg-white border border-slate-200 rounded-3xl px-6 py-4 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none text-sm"
              placeholder="How can we help you?"
            />

            <button type="button" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-full transition-colors flex items-center justify-center gap-2 shadow-lg hover:shadow-xl">
              Send Message <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default Contact;