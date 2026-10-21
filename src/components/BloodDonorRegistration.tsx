import React, { useState } from 'react';
import { X, Heart, Phone, MapPin, CheckCircle2 } from 'lucide-react';
import { BloodDonorProfile, BloodGroup, BLOOD_GROUPS_LIST } from '../types/blood';
import {
  getDonorProfileByUserId,
  registerOrUpdateBloodDonor,
} from '../utils/bloodDonationService';
import { useAuth } from '../context/AuthContext';

export interface BloodDonorRegistrationProps {
  isOpen?: boolean;
  onClose?: () => void;
  currentUser?: {
    id: number;
    fullName: string;
    avatarUrl: string;
    batchYear: number;
    profession?: string;
    institution?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    city?: string;
  };
  onSuccess?: (profile: BloodDonorProfile) => void;
  onSaved?: () => void;
  compact?: boolean;
}

export const BloodDonorRegistration: React.FC<BloodDonorRegistrationProps> = ({
  isOpen,
  onClose,
  currentUser: propUser,
  onSuccess,
  onSaved,
}) => {
  const { currentUser: authUser } = useAuth();
  const currentUser = propUser || authUser;
  const existing = getDonorProfileByUserId(currentUser.id);

  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(existing?.bloodGroup || 'O+');
  const [phone, setPhone] = useState(existing?.phone || currentUser.phone || '');
  const [city, setCity] = useState(existing?.city || currentUser.city || 'Bogura');
  const [isAvailable, setIsAvailable] = useState<boolean>(existing?.availability !== 'unavailable');

  if (isOpen === false) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const profile: BloodDonorProfile = {
      userId: currentUser.id,
      fullName: currentUser.fullName,
      avatarUrl: currentUser.avatarUrl,
      batchYear: currentUser.batchYear,
      profession: currentUser.profession || 'Doctor',
      institution: currentUser.institution || 'SZMC',
      phone: phone.trim(),
      whatsapp: phone.trim(),
      email: currentUser.email,
      bloodGroup,
      isRegisteredDonor: true,
      availability: isAvailable ? 'available' : 'unavailable',
      preferredArea: city.trim() || 'Bogura',
      city: city.trim() || 'Bogura',
      emergencyAlertPreference: 'all_urgent',
      donationHistory: existing?.donationHistory || [],
      updatedAt: new Date().toISOString(),
    };

    const saved = registerOrUpdateBloodDonor(profile);
    if (onSuccess) onSuccess(saved);
    if (onSaved) onSaved();
    if (onClose) onClose();
  };

  const formElement = (
    <div className={`liquid-blood-glass-card backdrop-blur-2xl border-2 border-rose-300/80 dark:border-rose-500/50 rounded-3xl w-full ${isOpen ? 'max-w-md shadow-2xl shadow-rose-950/50 overflow-hidden' : 'shadow-xs p-5'}`}>
      <div className="px-5 py-4 border-b border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between bg-gradient-to-r from-rose-500/15 via-red-500/20 to-rose-600/15 backdrop-blur-md">
        <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400 font-extrabold">
          <div className="w-8 h-8 rounded-xl liquid-blood-badge flex items-center justify-center shadow-xs">
            <Heart className="w-4 h-4 fill-white text-white animate-blood-pulse" />
          </div>
          <h2 className="text-base font-black text-slate-900 dark:text-white">
            {existing ? 'Update Donor Info' : 'I Want to Donate'}
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-rose-100/60 dark:hover:bg-rose-950/60 text-slate-500 hover:text-rose-600 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4 text-sm">
        {/* Blood Group */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            Your Blood Group
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {BLOOD_GROUPS_LIST.map((bg) => (
              <button
                type="button"
                key={bg}
                onClick={() => setBloodGroup(bg)}
                className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  bloodGroup === bg
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {bg}
              </button>
            ))}
          </div>
        </div>

        {/* Contact Phone */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Mobile Number (for emergency calls) *
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="tel"
              required
              placeholder="017..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Current City / Location
          </label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="e.g. Bogura, Dhaka"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>

        {/* Availability Toggle */}
        <div className="pt-1 flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
          <div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Available to Donate
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Can doctors contact you in emergencies?
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAvailable(!isAvailable)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
              isAvailable
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {isAvailable ? 'Yes (Ready)' : 'Paused'}
          </button>
        </div>

        {/* Submit */}
        <div className="pt-2 flex items-center justify-end gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black shadow-lg shadow-rose-600/40 flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 border border-rose-400/40"
          >
            <CheckCircle2 className="w-4 h-4 text-rose-200" />
            <span>{existing ? 'Save Info' : 'Join as Donor Now'}</span>
          </button>
        </div>
      </form>
    </div>
  );

  if (isOpen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
        {formElement}
      </div>
    );
  }

  return formElement;
};
