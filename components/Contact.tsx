import React from 'react';
import { Mail, MessageSquare, MapPin, Send } from 'lucide-react';

const Contact: React.FC = () => {
  return (
    <div className="min-h-screen pt-32 pb-20 px-4 md:px-6 bg-white">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16">
        
        {/* Info Side */}
        <div className="order-2 md:order-1 self-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">Get in touch</h1>
          <p className="text-xl text-slate-500 mb-10 leading-relaxed">
            Have a question about enterprise pricing? Found a bug? 
            We'd love to hear from you.
          </p>

          <div className="space-y-8">
             {[
               { icon: Mail, title: "Email Us", l1: "support@scai.co", l2: "sales@scai.co" },
               { icon: MessageSquare, title: "Live Chat", l1: "Available Mon-Fri", l2: "9am - 5pm PST" },
               { icon: MapPin, title: "Office", l1: "123 Innovation Dr", l2: "San Francisco, CA" }
             ].map((item, i) => (
                <div key={i} className="flex items-start gap-5">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center flex-shrink-0 border border-slate-100">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-slate-900 font-bold mb-1">{item.title}</h4>
                    <p className="text-slate-500 text-sm">{item.l1}</p>
                    <p className="text-slate-500 text-sm">{item.l2}</p>
                  </div>
                </div>
             ))}
          </div>
        </div>

        {/* Form Side */}
        <div className="bg-slate-50 border border-slate-100 p-8 md:p-10 rounded-[2.5rem] order-1 md:order-2">
          <form className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900 uppercase tracking-wider ml-1">First Name</label>
                <input type="text" className="w-full bg-white border border-slate-200 rounded-full px-6 py-3 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" placeholder="Jane" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900 uppercase tracking-wider ml-1">Last Name</label>
                <input type="text" className="w-full bg-white border border-slate-200 rounded-full px-6 py-3 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" placeholder="Doe" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wider ml-1">Email</label>
              <input type="email" className="w-full bg-white border border-slate-200 rounded-full px-6 py-3 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" placeholder="jane@company.com" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wider ml-1">Message</label>
              <textarea rows={4} className="w-full bg-white border border-slate-200 rounded-3xl px-6 py-4 text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none" placeholder="How can we help?" />
            </div>

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