import React, { useState } from 'react';
import { X, Heart, Hospital, Phone, AlertCircle } from 'lucide-react';
import { BloodGroup, BLOOD_GROUPS_LIST } from '../types/blood';
import { createBloodRequest } from '../utils/bloodDonationService';

interface BloodRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id: number;
    fullName: string;
    avatarUrl: string;
    batchYear: number;
    phone?: string;
  };
  onSuccess: (requestId: string) => void;
}

export const BloodRequestModal: React.FC<BloodRequestModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSuccess,
}) => {
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+');
  const [unitsRequired, setUnitsRequired] = useState(1);
  const [hospitalName, setHospitalName] = useState('');
  const [city, setCity] = useState('Bogura');
  const [contactPhone, setContactPhone] = useState(currentUser.phone || '');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalName.trim()) {
      setError('Please enter the Hospital or Clinic name.');
      return;
    }
    if (!contactPhone.trim()) {
      setError('Please provide a contact phone number.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const created = createBloodRequest({
        bloodGroup,
        unitsRequired,
        hospitalName: hospitalName.trim(),
        hospitalArea: city.trim(),
        city: city.trim() || 'Bogura',
        requiredDateTime: new Date().toISOString(),
        emergencyLevel: 'urgent',
        contactMethod: 'Attendant Emergency Line',
        contactPhone: contactPhone.trim(),
        description: description.trim() || 'Blood required for patient care',
        patientRelation: 'Patient',
        requesterId: currentUser.id,
        requesterName: currentUser.fullName,
        requesterAvatar: currentUser.avatarUrl,
        requesterBatch: currentUser.batchYear,
      });

      onSuccess(created.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to post blood request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in">
      <div className="liquid-blood-glass-card backdrop-blur-2xl border-2 border-rose-300/80 dark:border-rose-500/50 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-rose-950/50">
        {/* Header */}
        <div className="px-5 py-4 border-b border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between bg-gradient-to-r from-rose-500/15 via-red-500/20 to-rose-600/15 backdrop-blur-md">
          <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400 font-extrabold">
            <div className="w-8 h-8 rounded-xl liquid-blood-badge flex items-center justify-center shadow-xs">
              <Heart className="w-4 h-4 fill-white text-white animate-blood-pulse" />
            </div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">I Need Blood</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-rose-100/60 dark:hover:bg-rose-950/60 text-slate-500 hover:text-rose-600 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-sm">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Blood Group Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Blood Group Needed
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

          {/* Bags Needed */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Bags / Units Needed
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((num) => (
                <button
                  type="button"
                  key={num}
                  onClick={() => setUnitsRequired(num)}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    unitsRequired === num
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {num} Bag{num > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Hospital Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Hospital / Clinic Name *
            </label>
            <div className="relative">
              <Hospital className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                placeholder="e.g. SZMCH Bogura, DMCH Dhaka"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* City / Location */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Location / City
            </label>
            <input
              type="text"
              placeholder="e.g. Bogura, Dhaka, Rajshahi"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Contact Phone Number *
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="tel"
                required
                placeholder="017..."
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* Short Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Short Note (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Patient in surgery room, need blood by 2 PM"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black shadow-lg shadow-rose-600/40 flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all duration-200 hover:scale-105 active:scale-95 border border-rose-400/40"
            >
              <Heart className="w-3.5 h-3.5 fill-current animate-blood-pulse" />
              <span>{isSubmitting ? 'Posting Request...' : 'Post Request Now'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
