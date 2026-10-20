import React, { useState, useEffect, useMemo } from 'react';
import {
  HelpCircle,
  HeartHandshake,
  Search,
  CheckCircle2,
  Send,
  MessageSquare,
  Sparkles,
  ChevronRight,
  CornerDownRight,
  Check,
  GraduationCap,
} from 'lucide-react';
import {
  MentorshipCategory,
  MentorshipRequest,
  MentorOffer,
} from '../types/mentorship';
import {
  MENTORSHIP_CATEGORIES,
  loadMentorshipRequests,
  createMentorshipRequest,
  addMentorshipAnswer,
  loadMentorOffers,
  registerMentorOffer,
} from '../services/mentorshipService';
import { MentorshipCelebrationBanner } from './MentorshipCelebrationBanner';

interface CurrentUser {
  id: number;
  fullName: string;
  email?: string;
  phone?: string;
  batchYear?: number;
  avatarUrl?: string;
  institution?: string;
  position?: string;
  profession?: string;
}

interface MentorshipViewProps {
  currentUser?: CurrentUser | null;
  isLoggedIn?: boolean;
  onViewProfile?: (userId: number) => void;
  onNavigate?: (route: string) => void;
}

type MainActionType = 'ask' | 'offer' | 'find';

export const MentorshipView: React.FC<MentorshipViewProps> = ({
  currentUser,
  isLoggedIn = false,
  onViewProfile,
}) => {
  // Main 3 Actions selection: 'ask' (সাহায্য চাই) | 'offer' (সাহায্য দিতে চাই) | 'find' (সিনিয়র খুঁজুন)
  const [activeAction, setActiveAction] = useState<MainActionType>('find');

  // ACTION 1: “সাহায্য চাই” state
  const [askTopic, setAskTopic] = useState<MentorshipCategory>('Medical');
  const [targetedMentor, setTargetedMentor] = useState<MentorOffer | null>(null);
  const [askQuestion, setAskQuestion] = useState('');
  const [askContact, setAskContact] = useState('');
  const [askSuccessMessage, setAskSuccessMessage] = useState<string | null>(null);
  const [askSubmittedSnippet, setAskSubmittedSnippet] = useState<string | null>(null);

  // ACTION 2: “সাহায্য দিতে চাই” state
  const [offerCategory, setOfferCategory] = useState<MentorshipCategory>('Job');
  const [offerExpertise, setOfferExpertise] = useState('');
  const [offerDescription, setOfferDescription] = useState('');
  const [offerInstitution, setOfferInstitution] = useState(currentUser?.institution || '');
  const [offerPosition, setOfferPosition] = useState(currentUser?.position || '');
  const [offerContactPref, setOfferContactPref] = useState('হোয়াটসঅ্যাপ / মেসেজ');
  const [offerSuccessMessage, setOfferSuccessMessage] = useState<string | null>(null);
  const [offerSubmittedSnippet, setOfferSubmittedSnippet] = useState<string | null>(null);

  // ACTION 3: “সিনিয়র খুঁজুন” state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MentorshipCategory | 'all'>('all');

  // Data lists
  const [requests, setRequests] = useState<MentorshipRequest[]>(() => loadMentorshipRequests());
  const [mentors, setMentors] = useState<MentorOffer[]>(() => loadMentorOffers());

  // Inline answering state
  const [answeringReqId, setAnsweringReqId] = useState<string | null>(null);
  const [answerInputText, setAnswerInputText] = useState('');

  // Sync with events
  useEffect(() => {
    const handleMentorsUpdate = () => setMentors(loadMentorOffers());
    const handleRequestsUpdate = () => setRequests(loadMentorshipRequests());

    window.addEventListener('mentors_updated', handleMentorsUpdate);
    window.addEventListener('mentorship_requests_updated', handleRequestsUpdate);
    return () => {
      window.removeEventListener('mentors_updated', handleMentorsUpdate);
      window.removeEventListener('mentorship_requests_updated', handleRequestsUpdate);
    };
  }, []);

  // Category badges
  const getCategoryBadge = (cat: MentorshipCategory) => {
    switch (cat) {
      case 'Medical':
        return { label: 'Medical', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' };
      case 'Job':
        return { label: 'Job & Career', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' };
      case 'Abroad':
        return { label: 'Study Abroad', color: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800' };
      case 'Degree':
        return { label: 'University & Degree', color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' };
      case 'Business':
        return { label: 'Business & Startup', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' };
      default:
        return { label: cat, color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' };
    }
  };

  // Submit Question handler (Action 1)
  const handleSubmitQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuestion.trim()) return;

    const currentText = askQuestion.trim();
    createMentorshipRequest(
      askTopic,
      currentText,
      {
        id: currentUser?.id || Date.now(),
        name: currentUser?.fullName || 'সদস্য',
        batch: currentUser?.batchYear,
        avatar: currentUser?.avatarUrl,
        contact: askContact || currentUser?.phone || currentUser?.email,
      },
      targetedMentor ? { id: targetedMentor.userId, name: targetedMentor.fullName } : undefined
    );

    setRequests(loadMentorshipRequests());
    setAskSubmittedSnippet(currentText);
    setAskQuestion('');
    setAskContact('');
    setTargetedMentor(null);
    setAskSuccessMessage('আপনার প্রশ্নটি সফলভাবে জমা হয়েছে! সিনিয়ররা উত্তর দিলে এখানে দেখতে পাবেন।');
  };

  // Save Mentor Offer handler (Action 2)
  const handleSaveMentorOffer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerExpertise.trim() || !offerDescription.trim()) return;

    const currentExpertise = offerExpertise.trim();
    registerMentorOffer({
      userId: currentUser?.id || Date.now(),
      fullName: currentUser?.fullName || 'সিনিয়র মেন্টর',
      batchYear: currentUser?.batchYear,
      avatarUrl: currentUser?.avatarUrl,
      category: offerCategory,
      expertise: currentExpertise,
      shortDescription: offerDescription.trim(),
      institution: offerInstitution.trim() || undefined,
      position: offerPosition.trim() || undefined,
      contactPreference: offerContactPref,
    });

    setMentors(loadMentorOffers());
    setOfferSubmittedSnippet(`${currentExpertise}${offerInstitution ? ` • ${offerInstitution}` : ''}`);
    setOfferSuccessMessage('ধন্যবাদ! আপনার মেন্টর প্রোফাইল সফলভাবে সংরক্ষিত হয়েছে। জুনিয়ররা এখন আপনার সহায়তা নিতে পারবে।');
  };

  // Inline Answer handler
  const handlePostAnswer = (requestId: string) => {
    if (!answerInputText.trim()) return;

    addMentorshipAnswer(requestId, answerInputText, {
      id: currentUser?.id || Date.now(),
      name: currentUser?.fullName || 'সিনিয়র সদস্য',
      batch: currentUser?.batchYear,
      avatar: currentUser?.avatarUrl,
      profession: currentUser?.position || currentUser?.profession || 'মেন্টর',
    });

    setRequests(loadMentorshipRequests());
    setAnswerInputText('');
    setAnsweringReqId(null);
  };

  // Filtered mentors for Action 3
  const filteredMentors = useMemo(() => {
    return mentors.filter((m) => {
      if (selectedCategory !== 'all' && m.category !== selectedCategory) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.expertise.toLowerCase().includes(q) ||
        m.institution?.toLowerCase().includes(q) ||
        m.position?.toLowerCase().includes(q) ||
        m.shortDescription.toLowerCase().includes(q)
      );
    });
  }, [mentors, selectedCategory, searchQuery]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 font-sans px-3 sm:px-6 py-4 sm:py-8">
      {/* Header Banner */}
      <div className="rounded-2xl p-5 sm:p-7 bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-blue-100 text-xs font-semibold mb-3">
            <GraduationCap className="w-4 h-4 text-amber-300" />
            <span>মেন্টরশিপ ও ক্যারিয়ার নেটওয়ার্ক</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            কীভাবে সাহায্য চান বা করতে চান?
          </h1>
          <p className="text-sm sm:text-base text-blue-100/90 leading-relaxed">
            জুনিয়রদের সরাসরি প্রশ্ন ও অভিজ্ঞদের নির্ভরযোগ্য দিকনির্দেশনা। নিচের যেকোনো একটি অ্যাকশন বেছে নিন।
          </p>
        </div>
      </div>

      {/* 3 ACTIONS BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Action 1: সাহায্য চাই */}
        <button
          type="button"
          onClick={() => {
            setActiveAction('ask');
            setAskSuccessMessage(null);
          }}
          className={`p-4 sm:p-5 rounded-2xl text-left border-2 transition-all flex flex-col justify-between cursor-pointer ${
            activeAction === 'ask'
              ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/30 shadow-md ring-2 ring-amber-400/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg">
              🙋‍♂️
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
              অ্যাকশন ১
            </span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">সাহায্য চাই</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">বিষয় বেছে নিন ও প্রশ্ন জমা দিন</p>
          </div>
        </button>

        {/* Action 2: সাহায্য দিতে চাই */}
        <button
          type="button"
          onClick={() => {
            setActiveAction('offer');
            setOfferSuccessMessage(null);
          }}
          className={`p-4 sm:p-5 rounded-2xl text-left border-2 transition-all flex flex-col justify-between cursor-pointer ${
            activeAction === 'offer'
              ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30 shadow-md ring-2 ring-emerald-400/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg">
              🤝
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200">
              অ্যাকশন ২
            </span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">সাহায্য দিতে চাই</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">দক্ষতা ও বিবরণ দিয়ে মেন্টর হোন</p>
          </div>
        </button>

        {/* Action 3: সিনিয়র খুঁজুন */}
        <button
          type="button"
          onClick={() => setActiveAction('find')}
          className={`p-4 sm:p-5 rounded-2xl text-left border-2 transition-all flex flex-col justify-between cursor-pointer ${
            activeAction === 'find'
              ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/30 shadow-md ring-2 ring-blue-500/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
              🔍
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
              অ্যাকশন ৩
            </span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">সিনিয়র খুঁজুন</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">ফিল্টার ও সার্চ করে সিনিয়রদের পান</p>
          </div>
        </button>
      </div>

      {/* ACTION 1 FORM */}
      {activeAction === 'ask' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-900/50 p-5 sm:p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">১. সাহায্য চাই — আপনার প্রশ্নটি জমা দিন</h2>

          {askSuccessMessage && (
            <MentorshipCelebrationBanner
              type="request"
              title="প্রশ্নটি সফলভাবে জমা হয়েছে!"
              message="আপনার জিজ্ঞাসাটি কমিউনিটিতে পোস্ট করা হয়েছে। সিনিয়ররা উত্তর দিলে নিচে দেখতে পাবেন।"
              snippet={askSubmittedSnippet || undefined}
              onDismiss={() => setAskSuccessMessage(null)}
            />
          )}

          <form onSubmit={handleSubmitQuestion} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                বিষয় বেছে নিন *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {MENTORSHIP_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setAskTopic(cat.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      askTopic === cat.id
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 font-semibold'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span className="text-xl mb-1">{cat.icon}</span>
                    <span className="text-sm font-bold">{cat.labelBn}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                সংক্ষিপ্ত প্রশ্ন লিখুন *
              </label>
              <textarea
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                placeholder="যেমন: ইন্টার্নশিপ শেষ করে পোস্ট-গ্রাজুয়েশন বা এফসিপিএস প্রস্তুতি কীভাবে শুরু করব?"
                rows={3}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                আপনার ইমেইল বা ফোন (ঐচ্ছিক):
              </label>
              <input
                type="text"
                value={askContact}
                onChange={(e) => setAskContact(e.target.value)}
                placeholder="যেমন: 017xxxxxxxx বা user@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!askQuestion.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-sm shadow-md cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>জমা দিন</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ACTION 2 FORM */}
      {activeAction === 'offer' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 p-5 sm:p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">২. সাহায্য দিতে চাই — মেন্টর প্রোফাইল</h2>

          {offerSuccessMessage && (
            <MentorshipCelebrationBanner
              type="offer"
              title="সিনিয়র মেন্টর প্রোফাইল সফলভাবে সংরক্ষিত হয়েছে!"
              message="ধন্যবাদ! আপনার পরামর্শ দিয়ে পথপ্রদর্শনে অংশ নেওয়ার জন্য কমিউনিটি কৃতজ্ঞ।"
              snippet={offerSubmittedSnippet || undefined}
              onDismiss={() => setOfferSuccessMessage(null)}
            />
          )}

          <form onSubmit={handleSaveMentorOffer} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                ক্যাটেগরি বেছে নিন *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {MENTORSHIP_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setOfferCategory(cat.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      offerCategory === cat.id
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 font-semibold'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span className="text-xl mb-1">{cat.icon}</span>
                    <span className="text-sm font-bold">{cat.labelBn}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                আপনার দক্ষতার ক্ষেত্র *
              </label>
              <input
                type="text"
                value={offerExpertise}
                onChange={(e) => setOfferExpertise(e.target.value)}
                placeholder="যেমন: FCPS সার্জারি, বিসিএস স্বাস্থ্য, ইউএসএমএলই স্টেপ ১ ও ২, প্ল্যাব"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                সংক্ষিপ্ত বিবরণ *
              </label>
              <textarea
                value={offerDescription}
                onChange={(e) => setOfferDescription(e.target.value)}
                placeholder="কীভাবে জুনিয়রদের সাহায্য করতে পারবেন তা লিখুন..."
                rows={3}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  প্রতিষ্ঠান (কর্মক্ষেত্র / হাসপাতাল):
                </label>
                <input
                  type="text"
                  value={offerInstitution}
                  onChange={(e) => setOfferInstitution(e.target.value)}
                  placeholder="যেমন: SZMCH বগুড়া / ঢাকা মেডিকেল কলেজ / NHS UK"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  পদবী / প্রফেশন:
                </label>
                <input
                  type="text"
                  value={offerPosition}
                  onChange={(e) => setOfferPosition(e.target.value)}
                  placeholder="যেমন: সহকারী অধ্যাপক / কনসালট্যান্ট / মেডিকেল অফিসার"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!offerExpertise.trim() || !offerDescription.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm shadow-md cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>সংরক্ষণ করুন</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ACTION 3: SENIOR SEARCH & CARDS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            <span>৩. সিনিয়র খুঁজুন — ক্যাটাগরি ও সার্চ</span>
          </h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            মোট {filteredMentors.length} জন সিনিয়র
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="নাম, প্রতিষ্ঠান, পদবী বা দক্ষতার বিষয় দিয়ে খুঁজুন..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            সব ({mentors.length})
          </button>
          {MENTORSHIP_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.labelBn}</span>
            </button>
          ))}
        </div>

        {/* Seniors Grid */}
        {filteredMentors.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              কোনো সিনিয়র পাওয়া যায়নি
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMentors.map((senior) => {
              const badge = getCategoryBadge(senior.category);
              return (
                <div
                  key={senior.id}
                  className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start gap-3.5">
                    <img
                      src={
                        senior.avatarUrl ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(senior.fullName)}&background=1e40af&color=fff`
                      }
                      alt={senior.fullName}
                      className="w-12 h-12 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                        {senior.fullName}
                      </h4>
                      {(senior.position || senior.institution) && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate mt-0.5">
                          {senior.position} {senior.position && senior.institution && ' • '} {senior.institution}
                        </p>
                      )}
                      <span className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full border mt-1.5 ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      🎯 দক্ষতা: {senior.expertise}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 line-clamp-2">
                      {senior.shortDescription}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500">
                      মাধ্যম: {senior.contactPreference || 'মেসেজ'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetedMentor(senior);
                        setAskTopic(senior.category);
                        setActiveAction('ask');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                    >
                      প্রশ্ন করুন
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RECENT QUESTIONS & ANSWERS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-4">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <span>সাম্প্রতিক প্রশ্নোত্তর ও সিনিয়রদের পরামর্শ</span>
        </h3>

        {requests.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">এখনো কোনো প্রশ্ন জমা হয়নি।</p>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-bold text-sm text-slate-900 dark:text-white">{req.userName}</span>
                    <span className="text-[11px] text-slate-400 ml-2">• {req.createdAt}</span>
                  </div>
                  <span className="text-xs text-emerald-600 font-semibold">
                    {req.answers?.length ? `${req.answers.length}টি উত্তর` : 'উত্তরের অপেক্ষায়'}
                  </span>
                </div>

                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  “{req.question}”
                </p>

                {/* Answers List */}
                {req.answers && req.answers.length > 0 && (
                  <div className="space-y-2 pl-3 border-l-2 border-indigo-200 dark:border-indigo-900">
                    {req.answers.map((ans) => (
                      <div key={ans.id} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 text-xs">
                        <span className="font-bold text-indigo-700 dark:text-indigo-300">{ans.mentorName}: </span>
                        <span className="text-slate-700 dark:text-slate-300">{ans.answerText}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline Answer Box */}
                <div className="pt-1">
                  {answeringReqId !== req.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAnsweringReqId(req.id);
                        setAnswerInputText('');
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
                    >
                      <CornerDownRight className="w-3.5 h-3.5" />
                      <span>উত্তর বা পরামর্শ লিখুন</span>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-indigo-300 space-y-2">
                      <textarea
                        value={answerInputText}
                        onChange={(e) => setAnswerInputText(e.target.value)}
                        placeholder="আপনার পরামর্শ বা উত্তর লিখুন..."
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setAnsweringReqId(null)}
                          className="px-3 py-1 rounded-lg text-xs text-slate-500 cursor-pointer"
                        >
                          বাতিল
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePostAnswer(req.id)}
                          className="px-4 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                        >
                          পোস্ট করুন
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
