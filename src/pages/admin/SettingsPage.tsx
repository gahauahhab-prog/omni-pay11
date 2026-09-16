import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Upload, RotateCcw, Building } from 'lucide-react';
import { Settings } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error, info } = useToast();

  const [settings, setSettings] = useState<Settings>(() => db.getSettings());
  const [companyName, setCompanyName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const s = db.getSettings();
    setSettings(s);
    setCompanyName(s.company_name);
    setSupportEmail(s.support_email);
    setSupportPhone(s.support_phone);
    setLogoUrl(s.logo_url || '');
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error('Invalid format', 'Please choose a valid image file (PNG/JPG/SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(reader.result as string);
      success('Logo Loaded', 'Portal logo updated. Click Save to persist.');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !supportEmail || !supportPhone) {
      error('Required Fields', 'Company Name, Support Email, and Phone are mandatory.');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await db.updateSettings(
        {
          company_name: companyName,
          support_email: supportEmail,
          support_phone: supportPhone,
          logo_url: logoUrl,
        },
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      setSettings(updated);
      success('Settings Saved', 'Portal configuration updated successfully.');
    } catch {
      error('Save Failed', 'Unable to persist portal settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDemoData = () => {
    if (
      window.confirm(
        'Reset all demo accounts, banks, UPI IDs, and settings to original specification values?'
      )
    ) {
      db.resetToDefaults();
      info('Database Reset', 'Demo data and initial Super Admin restored.');
      const s = db.getSettings();
      setSettings(s);
      setCompanyName(s.company_name);
      setSupportEmail(s.support_email);
      setSupportPhone(s.support_phone);
      setLogoUrl(s.logo_url || '');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Portal Settings</h2>
        <p className="text-xs text-slate-500 mt-1">
          Configure branding, support contact details displayed on the client portal, and defaults.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Branding & Company Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Company / Portal Name"
              placeholder="e.g. Payment Portal"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Portal Logo
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Portal Logo" className="w-full h-full object-contain" />
                  ) : (
                    <Building className="w-7 h-7 text-slate-400" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    <span>Upload Logo Image</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="block text-[11px] text-rose-600 hover:underline"
                    >
                      Clear Logo
                    </button>
                  )}
                  <p className="text-[11px] text-slate-400">Recommended size: 256x256 PNG or SVG</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client Support Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Support Email"
                type="email"
                placeholder="support@paymentportal.com"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                required
                helperText="Displayed directly on the Client Support view"
              />
              <Input
                label="Support Phone / Helpline"
                type="text"
                placeholder="+91 9999999999"
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                required
                helperText="Dedicated telephone or WhatsApp support number"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDemoData}
            leftIcon={<RotateCcw className="w-3.5 h-3.5 text-slate-500" />}
          >
            Reset Default Demo Data
          </Button>

          <Button type="submit" size="md" isLoading={isSaving} leftIcon={<Save className="w-4 h-4" />}>
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
};
