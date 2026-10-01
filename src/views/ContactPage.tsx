import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Mail, Phone, Clock, Send, MessageSquare, CheckCircle, Loader2, MapPin } from 'lucide-react';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setSubmitError(data.error || 'Failed to send message. Please try again.');
        return;
      }
      setSubmitted(true);
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-3 py-1 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3"
          >
            Contact Us
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 leading-tight"
          >
            Get in Touch
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/75 text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
          >
            We&apos;re here to help with all your Himalayan salt needs
          </motion.p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="grid lg:grid-cols-3 gap-5 lg:gap-8">
          {/* Contact Info */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-1 space-y-4"
          >
            <div className="bg-white rounded-2xl p-5 shadow-md">
              <h3 className="font-serif text-lg font-bold text-charcoal mb-4">Contact Information</h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-himalayan-lighter rounded-lg flex items-center justify-center flex-shrink-0">
                    <Mail size={18} className="text-himalayan" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-charcoal mb-0.5">Email</h4>
                    <a href="mailto:sales@himalayankoh.com" className="text-himalayan hover:underline text-sm">
                      sales@himalayankoh.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-himalayan-lighter rounded-lg flex items-center justify-center flex-shrink-0">
                    <Phone size={18} className="text-himalayan" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-charcoal mb-0.5">Phone</h4>
                    <a href="tel:8322246466" className="text-himalayan hover:underline text-sm">
                      (832) 224-6466
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-himalayan-lighter rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock size={18} className="text-himalayan" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-charcoal mb-0.5">Phone Hours</h4>
                    <p className="text-charcoal-light text-sm">
                      Monday - Friday: 8:00 AM - 5:00 PM CST<br />
                      Closed weekends and holidays
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-himalayan-lighter rounded-lg flex items-center justify-center flex-shrink-0">
                    <MapPin size={18} className="text-himalayan" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-charcoal mb-0.5">Mailing Address</h4>
                    <p className="text-charcoal-light text-sm">
                      12620 FM 1960 W Ste A-4<br />
                      Houston, TX 77065
                    </p>
                    <p className="text-charcoal-light text-xs mt-1.5">
                      Returns go to a different address - see the{' '}
                      <Link href="/returns" className="text-himalayan hover:underline font-semibold">
                        return policy
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Call CTA */}
            <div className="bg-himalayan rounded-2xl p-5 text-white">
              <MessageSquare size={20} className="mb-3" />
              <h3 className="font-serif text-lg font-bold mb-1.5">Need Bulk Orders?</h3>
              <p className="text-white/80 text-sm mb-3">
                Call us directly for bulk order inquiries.
              </p>
              <a
                href="tel:8322246466"
                className="inline-flex items-center justify-center gap-2 px-5 min-h-11 bg-white text-himalayan font-semibold rounded-xl hover:bg-white/90 transition-colors text-sm"
              >
                <Phone size={16} />
                Call Now
              </a>
            </div>
          </motion.div>

          {/* Contact Form */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2"
          >
            <div className="bg-white rounded-2xl p-5 md:p-6 shadow-md">
              <h3 className="font-serif text-xl font-bold text-charcoal mb-1.5">Send us a Message</h3>
              <p className="text-charcoal-light mb-5">
                Fill out the form and we&apos;ll get back to you. We answer messages during
                business hours, Monday to Friday.
              </p>

              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8"
                >
                  <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
                  <h4 className="font-serif text-xl font-bold text-charcoal mb-1.5">Message Sent!</h4>
                  <p className="text-charcoal-light">We&apos;ll get back to you shortly.</p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-charcoal mb-1.5">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-charcoal mb-1.5">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-charcoal mb-1.5">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                        placeholder="(123) 456-7890"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-charcoal mb-1.5">
                        Subject *
                      </label>
                      <select
                        required
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                      >
                        <option value="">Select a subject</option>
                        <option value="general">General Inquiry</option>
                        <option value="bulk">Bulk Order</option>
                        <option value="support">Product Support</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-charcoal mb-1.5">
                      Message *
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all resize-none"
                      placeholder="How can we help you?"
                    />
                  </div>

                  {submitError && (
                    <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl">{submitError}</p>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 min-h-11 bg-himalayan hover:bg-himalayan-dark disabled:opacity-70 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-himalayan/25"
                  >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    {submitting ? 'Sending…' : 'Send Message'}
                  </motion.button>

                  <p className="text-xs text-charcoal-light leading-relaxed">
                    By sending this form you agree that the details you submit are collected and
                    stored so we can answer you. For further details on how we handle your data,
                    see our{' '}
                    <Link href="/privacy" className="text-himalayan hover:underline">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
