/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Compass, Search, LocateFixed, Zap, X, Plus, Minus, Layers, Check, Camera, FileText, CreditCard, Clock, ChevronLeft, Upload, RefreshCw, Scan, LayoutGrid, Users, Trash2, User, Mail, Phone, Link2, Briefcase, Star, MapPinned, Lock, Unlock, Globe, Target, LogIn, LogOut, Maximize2, CheckCircle2, Sparkles, ShieldCheck, HelpCircle, Settings, Volume2, VolumeX, Bell, AlertTriangle, ShieldAlert, Crown, AlertCircle, Inbox, Archive, Send, Eye, EyeOff, ShoppingBag, MessageSquare, Megaphone, DollarSign } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot, collection, query, where, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';

// Fix for default marker icons in Leaflet when using Vite/Webpack
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function ZoomControls({ isSatellite, setIsSatellite }: { isSatellite: boolean, setIsSatellite: (val: boolean | ((prev: boolean) => boolean)) => void }) {
  const map = useMap();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
        <button
          onClick={() => { (window as any).playClick?.(); map.zoomIn(); }}
          className="p-3 hover:bg-gray-50 border-b border-gray-100 text-black transition-colors"
          title="Zoom In"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          onClick={() => { (window as any).playClick?.(); map.zoomOut(); }}
          className="p-3 hover:bg-gray-50 border-b border-gray-100 text-black transition-colors"
          title="Zoom Out"
        >
          <Minus className="w-5 h-5" />
        </button>
        <button
          onClick={() => {
            (window as any).playClick?.();
            const nextVal = !isSatellite;
            try {
              localStorage.setItem('timegig_is_satellite', String(nextVal));
            } catch (e) {
              console.warn('Satellite storage notice:', e);
            }
            setIsSatellite(nextVal);
          }}
          className={`p-3 hover:bg-gray-50 transition-colors ${isSatellite ? 'text-blue-600 bg-blue-50' : 'text-black'}`}
          title={isSatellite ? "Satellite View Active (Click for Default Map)" : "Default Map View (Click for Satellite View)"}
        >
          <Layers className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function RecenterMap({ position, zoom = 15 }: { position: [number, number], zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position, zoom, {
      duration: 1.5,
      easeLinearity: 0.25
    });
  }, [position, zoom, map]);
  return null;
}

function MapClickHandler({ setLocation, setIsSelectingLocation, setShowGigForm }: { setLocation: (loc: [number, number]) => void, setIsSelectingLocation: (val: boolean) => void, setShowGigForm: (val: boolean) => void }) {
  useMapEvents({
    dblclick(e) {
      setLocation([e.latlng.lat, e.latlng.lng]);
      setIsSelectingLocation(false);
      setShowGigForm(true);
    },
  });
  return null;
}

type VerificationStep = 'selfie' | 'id' | 'pop' | 'pending' | null;

interface Referral {
  id: string;
  userId: string;
  name: string;
  type: 'Tenant' | 'User';
  selfie: string;
  idDoc: string;
  pop: string;
  date: string;
  status: string;
  isViewed?: boolean;
  isFrozen?: boolean;
  subscriptionExpiresAt?: any;
  activatedAt?: any;
  plan?: string;
  referrerId?: string;
  createdAtMs?: number;
  isManagedByMainAdmin?: boolean;
  takenOverBy?: string;
}

interface TenantAccount {
  uid: string;
  email: string;
  name?: string;
  surname?: string;
  contact?: string;
  location?: string;
  role: 'Tenant' | 'User';
  isApproved?: boolean;
  isFrozen?: boolean;
  isTakenOver?: boolean;
  takenOverBy?: string;
  takenOverAt?: any;
  subscriptionExpiresAt?: any;
  tenantProfit?: number;
  userProfit?: number;
  tenantSubProfit?: number;
  userSubProfit?: number;
  complianceWarningIssuedAt?: any;
  complianceWarningDeadline?: any;
  complianceNoticeReason?: string;
  createdAt?: any;
  originalTenantEmail?: string;
  originalTenantName?: string;
}

function useSubscriptionCountdown(expiresAt: any) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
    isExpiringSoon: boolean;
    formatted: string;
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
    isExpiringSoon: false,
    formatted: '--:--:--'
  });

  useEffect(() => {
    const calculate = () => {
      let targetMs: number;
      if (!expiresAt) {
        targetMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      } else if (typeof expiresAt?.toDate === 'function') {
        targetMs = expiresAt.toDate().getTime();
      } else if (expiresAt instanceof Date) {
        targetMs = expiresAt.getTime();
      } else if (typeof expiresAt === 'number') {
        targetMs = expiresAt;
      } else {
        const parsed = new Date(expiresAt).getTime();
        targetMs = isNaN(parsed) ? Date.now() + 30 * 24 * 60 * 60 * 1000 : parsed;
      }

      const diff = targetMs - Date.now();
      if (diff <= 0) {
        setTimeLeft({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true,
          isExpiringSoon: true,
          formatted: 'Expired'
        });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      const isExpiringSoon = days <= 7;

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        isExpired: false,
        isExpiringSoon,
        formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`
      });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return timeLeft;
}

function ReferralCountdownWidget({ referral, onRenew }: { referral: Referral; onRenew?: () => void }) {
  const defaultExpiry = useRef(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).current;
  const expiry = referral.subscriptionExpiresAt || defaultExpiry;
  const { days, hours, minutes, seconds, isExpired, isExpiringSoon } = useSubscriptionCountdown(expiry);

  return (
    <div className={`p-5 rounded-3xl border transition-all ${isExpired ? 'bg-red-50 border-red-200' : isExpiringSoon ? 'bg-amber-50/90 border-amber-300 shadow-md' : 'bg-black text-white border-white/10'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${isExpired ? 'text-red-500' : isExpiringSoon ? 'text-amber-600' : 'text-emerald-400'}`} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-900' : 'text-gray-300'}`}>
            Tenant Subscription Countdown
          </span>
        </div>
        <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ${isExpired ? 'bg-red-500 text-white' : isExpiringSoon ? 'bg-amber-500 text-white animate-pulse' : 'bg-emerald-500 text-white'}`}>
          {isExpired ? 'Expired' : isExpiringSoon ? 'Expiring Soon' : 'Active'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center my-3">
        <div className={`p-2.5 rounded-2xl ${isExpired || isExpiringSoon ? 'bg-white shadow-sm border border-gray-100' : 'bg-white/10 border border-white/10'}`}>
          <div className={`text-xl font-black ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-800' : 'text-white'}`}>{days}</div>
          <div className={`text-[8px] font-black uppercase tracking-wider ${isExpired || isExpiringSoon ? 'text-gray-500' : 'text-gray-400'}`}>Days</div>
        </div>
        <div className={`p-2.5 rounded-2xl ${isExpired || isExpiringSoon ? 'bg-white shadow-sm border border-gray-100' : 'bg-white/10 border border-white/10'}`}>
          <div className={`text-xl font-black ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-800' : 'text-white'}`}>{hours}</div>
          <div className={`text-[8px] font-black uppercase tracking-wider ${isExpired || isExpiringSoon ? 'text-gray-500' : 'text-gray-400'}`}>Hours</div>
        </div>
        <div className={`p-2.5 rounded-2xl ${isExpired || isExpiringSoon ? 'bg-white shadow-sm border border-gray-100' : 'bg-white/10 border border-white/10'}`}>
          <div className={`text-xl font-black ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-800' : 'text-white'}`}>{minutes}</div>
          <div className={`text-[8px] font-black uppercase tracking-wider ${isExpired || isExpiringSoon ? 'text-gray-500' : 'text-gray-400'}`}>Mins</div>
        </div>
        <div className={`p-2.5 rounded-2xl ${isExpired || isExpiringSoon ? 'bg-white shadow-sm border border-gray-100' : 'bg-white/10 border border-white/10'}`}>
          <div className={`text-xl font-black ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-800' : 'text-emerald-400'}`}>{seconds}</div>
          <div className={`text-[8px] font-black uppercase tracking-wider ${isExpired || isExpiringSoon ? 'text-gray-500' : 'text-gray-400'}`}>Secs</div>
        </div>
      </div>

      {(isExpiringSoon || isExpired) && (
        <div className="mt-3 p-3 bg-amber-100/90 rounded-2xl border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-black text-[11px] uppercase tracking-wider text-amber-900">
              {isExpired ? 'Subscription Expired' : 'Warning: Subscription Ending Soon'}
            </p>
            <p className="text-[11px] leading-relaxed text-amber-800">
              {isExpired 
                ? 'This Tenant subscription has expired. Renew immediately to restore active tenant privileges and referral commission.'
                : `This Tenant subscription expires in ${days} day${days === 1 ? '' : 's'} (${hours}h ${minutes}m). Warn the tenant to renew before expiration to keep the account active.`}
            </p>
          </div>
        </div>
      )}

      {onRenew && (
        <button
          onClick={onRenew}
          className={`w-full mt-3 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${
            isExpired || isExpiringSoon
              ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md'
              : 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reset Subscription Countdown After Payment (+30 Days)
        </button>
      )}
    </div>
  );
}

function ReferralListTimerPill({ expiresAt }: { expiresAt: any }) {
  const defaultExpiry = useRef(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).current;
  const expiry = expiresAt || defaultExpiry;
  const { days, hours, isExpired, isExpiringSoon } = useSubscriptionCountdown(expiry);

  if (isExpired) {
    return (
      <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-red-100 text-red-600 border border-red-200 flex items-center gap-1">
        <AlertTriangle className="w-2.5 h-2.5" /> Expired
      </span>
    );
  }
  if (isExpiringSoon) {
    return (
      <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-500 text-white animate-pulse flex items-center gap-1">
        <Clock className="w-2.5 h-2.5" /> {days}d {hours}h left
      </span>
    );
  }
  return (
    <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
      <Clock className="w-2.5 h-2.5 text-emerald-600" /> {days}d {hours}h left
    </span>
  );
}

function TenantSubscriptionAlertBanner({ 
  expiresAt, 
  onRenew,
  compact = false
}: { 
  expiresAt: any; 
  onRenew: () => void; 
  compact?: boolean;
}) {
  const defaultExpiry = useRef(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).current;
  const expiry = expiresAt || defaultExpiry;
  const { days, hours, minutes, seconds, isExpired, isExpiringSoon } = useSubscriptionCountdown(expiry);

  if (!isExpiringSoon && !isExpired) return null;

  if (compact) {
    return (
      <div 
        onClick={onRenew}
        className="pointer-events-auto mx-auto bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-full shadow-lg border border-amber-300 flex items-center justify-between gap-3 text-xs font-black cursor-pointer active:scale-95 transition-all animate-pulse"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-white" />
          <span>Tenant Sub Warning: {isExpired ? 'Expired' : `${days}d ${hours}h ${minutes}m left`}</span>
        </div>
        <span className="bg-black/30 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider">Keep Active</span>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white p-4 rounded-3xl shadow-lg border border-white/20 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-white animate-bounce" />
          </div>
          <div>
            <h4 className="font-black text-xs uppercase tracking-wider flex flex-wrap items-center gap-2">
              Tenant Subscription Ending Soon!
              <span className="bg-black/30 text-[9px] px-2 py-0.5 rounded-full font-bold">
                {isExpired ? 'Expired' : `${days}d ${hours}h ${minutes}m ${seconds}s left`}
              </span>
            </h4>
            <p className="text-[11px] text-white/90 mt-1 leading-snug">
              {isExpired
                ? 'Your monthly Tenant subscription has expired. Renew immediately to maintain tenant passive profit earnings and referrals.'
                : `Your Tenant subscription ends in ${days} days (${hours}h ${minutes}m). Keep it active to ensure uninterrupted referral commissions.`}
            </p>
          </div>
        </div>
        <button
          onClick={onRenew}
          className="bg-white text-black hover:bg-gray-100 font-black text-[10px] uppercase tracking-wider py-2.5 px-3.5 rounded-xl shadow-md transition-all active:scale-95 shrink-0"
        >
          Keep Active
        </button>
      </div>
    </div>
  );
}

function useComplianceCountdown(deadline: any) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
    formatted: string;
  }>({
    hours: 24,
    minutes: 0,
    seconds: 0,
    isExpired: false,
    formatted: '24:00:00'
  });

  useEffect(() => {
    if (!deadline) {
      setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isExpired: false, formatted: '--:--:--' });
      return;
    }

    const calculate = () => {
      let targetMs: number;
      if (typeof deadline?.toDate === 'function') {
        targetMs = deadline.toDate().getTime();
      } else if (deadline instanceof Date) {
        targetMs = deadline.getTime();
      } else if (typeof deadline === 'number') {
        targetMs = deadline;
      } else {
        const parsed = new Date(deadline).getTime();
        targetMs = isNaN(parsed) ? Date.now() + 24 * 60 * 60 * 1000 : parsed;
      }

      const diff = targetMs - Date.now();
      if (diff <= 0) {
        setTimeLeft({
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true,
          formatted: '00:00:00 (Expired)'
        });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({
        hours,
        minutes,
        seconds,
        isExpired: false,
        formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return timeLeft;
}

function TenantComplianceNoticeCountdownPill({ deadline }: { deadline: any }) {
  const { hours, minutes, seconds, isExpired } = useComplianceCountdown(deadline);
  if (isExpired) {
    return (
      <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-red-100 text-red-600 border border-red-300 flex items-center gap-1 shadow-sm">
        <AlertTriangle className="w-2.5 h-2.5" /> 24h Notice Expired
      </span>
    );
  }
  return (
    <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-500 text-white animate-pulse flex items-center gap-1 shadow-sm">
      <Clock className="w-2.5 h-2.5" /> 24h Warning: {hours}h {minutes}m {seconds}s left
    </span>
  );
}

const WORK_TRADES = [
  'Dog Walk', 'Security', 'General Laborer', 'Movers', 'Painting', 'Construction', 
  'Nanny', 'Gardening', 'Electrician', 'Plumbing', 'Cleaning', 'Handyman', 
  'Tiling', 'Roofing', 'Car Wash', 'Deliveries', 'Pool Maintenance', 'Catering',
  'Event Decor', 'Tutoring', 'IT Support', 'Photography', 'Landscaping'
];

export default function App() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [searchPosition, setSearchPosition] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isPermissionsBlocked, setIsPermissionsBlocked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSatellite, setIsSatellite] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('timegig_is_satellite');
        if (saved !== null) {
          return saved === 'true';
        }
      }
    } catch (e) {
      console.warn('Failed to read satellite view preference:', e);
    }
    return false;
  });
  const [activeTab, setActiveTab] = useState<'map' | 'activation' | 'tenant' | 'referrals' | 'seekers' | 'profile' | 'shop' | 'auth'>('map');
  const [seekerSearchQuery, setSeekerSearchQuery] = useState('');
  const [seekerTradeFilter, setSeekerTradeFilter] = useState('All');
  const [offerGigModalSeeker, setOfferGigModalSeeker] = useState<any | null>(null);
  const [offerGigTitle, setOfferGigTitle] = useState('');
  const [offerGigDetails, setOfferGigDetails] = useState('');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userRole, setUserRole] = useState<'User' | 'Tenant'>('User');
  const [verificationStep, setVerificationStep] = useState<VerificationStep>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [referralView, setReferralView] = useState<Referral | null>(null);
  const [showReferralList, setShowReferralList] = useState(false);
  const [stats, setStats] = useState({ 
    tenantProfit: 0, 
    userProfit: 0, 
    totalReferrals: 0,
    tenantSubFee: 100,
    userSubFee: 25,
    tenantSignupTarget: 10,
    userSubSignupTarget: 100
  });

  // Active accepted gig for map destination navigation
  const [activeAcceptedGig, setActiveAcceptedGig] = useState<{
    id: string;
    title: string;
    location: [number, number];
    budget?: number;
    contact?: string;
    ownerName?: string;
    applicantName?: string;
  } | null>(null);

  // Persist Satellite Map View Preference across logout, login, and page reloads
  useEffect(() => {
    try {
      localStorage.setItem('timegig_is_satellite', String(isSatellite));
    } catch (e) {
      console.warn('Failed to save satellite preference to localStorage:', e);
    }
    if (user?.uid && db) {
      updateDoc(doc(db, 'users', user.uid), { isSatellite }).catch(() => null);
    }
  }, [isSatellite, user?.uid]);

  // Main Tenant Overseer State (timegig2026@gmail.com)
  const isMainTenant = Boolean(user?.email && user.email.trim().toLowerCase() === 'timegig2026@gmail.com');
  const canManagePromotions = isMainTenant || userRole === 'Tenant';
  const [allTenants, setAllTenants] = useState<TenantAccount[]>([]);
  const [allUsersList, setAllUsersList] = useState<any[]>([]);
  const [overseerFilter, setOverseerFilter] = useState<'all' | 'delinquent' | 'warned' | 'frozen' | 'taken_over'>('all');
  const [showOverseerCenter, setShowOverseerCenter] = useState(true);
  const [adminNotificationToast, setAdminNotificationToast] = useState<{ title: string; message: string } | null>(null);
  const previousDelinquentCountRef = useRef(0);

  // Full Screen Image Viewer Modal State
  const [fullScreenImage, setFullScreenImage] = useState<{ url: string; title: string; subtitle?: string } | null>(null);

  // Activated Popups State
  const [tenantApprovalPopup, setTenantApprovalPopup] = useState<{ name: string; type: string; profitAmount?: number; profitLabel?: string } | null>(null);
  const [showReferralActivatedPopup, setShowReferralActivatedPopup] = useState(false);
  const [showWelcomeBackPopup, setShowWelcomeBackPopup] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [promoSubject, setPromoSubject] = useState('');
  const [promoBody, setPromoBody] = useState('');
  const [promoTargetType, setPromoTargetType] = useState<'all' | 'tenants' | 'users' | 'selected'>('all');
  const [selectedPromoRecipientUids, setSelectedPromoRecipientUids] = useState<string[]>([]);
  const [recipientSearchQuery, setRecipientSearchQuery] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [promoSuccessToast, setPromoSuccessToast] = useState<string | null>(null);
  const [mainTenantInboxTab, setMainTenantInboxTab] = useState<'compose' | 'sent' | 'direct' | 'feedback'>('compose');

  // Feedback State
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState<'Feature Request' | 'App Improvement' | 'Idea' | 'Bug Report'>('Feature Request');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSuccessToast, setFeedbackSuccessToast] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);

  // Referral Welcome State
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [inviterId, setInviterId] = useState<string>('');

  // Splash Screen State (5 seconds)
  const [showSplash, setShowSplash] = useState(true);

  // Feature Help Modal State
  const [helpInfo, setHelpInfo] = useState<{ title: string; content: string } | null>(null);

  // Settings Modal & Audio Preference State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Track initial listener loads so sound alerts only trigger on new events
  const isInitialReferralsLoadRef = useRef(true);
  const isInitialGigsLoadRef = useRef(true);

  // Auth Input States (Google + Direct Email Auth)
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  // Administrative Wipe All Accounts (Main Tenant Only)
  const [isWipingData, setIsWipingData] = useState(false);
  const handleWipeAllAccounts = async () => {
    if (!user || !isMainTenant) return;
    if (!confirm("⚠️ CRITICAL ACTION: This will delete ALL registered users, verifications, and messages from the database. This cannot be undone. Are you absolutely sure?")) return;
    if (!confirm("FINAL CONFIRMATION: Are you really sure you want to PERMANENTLY WIPE ALL ACCOUNTS?")) return;
    
    setIsWipingData(true);
    try {
      // 1. Wipe Verifications
      const vSnap = await getDocs(collection(db, 'verifications'));
      for (const d of vSnap.docs) {
        await deleteDoc(doc(db, 'verifications', d.id));
      }
      
      // 2. Wipe Messages
      const mSnap = await getDocs(collection(db, 'messages'));
      for (const d of mSnap.docs) {
        await deleteDoc(doc(db, 'messages', d.id));
      }
      
      // 3. Wipe Users (except Main Tenant)
      const uSnap = await getDocs(collection(db, 'users'));
      for (const d of uSnap.docs) {
        if (d.id !== user.uid) {
          await deleteDoc(doc(db, 'users', d.id));
        }
      }

      playSmoothAlarmSound();
      alert("✅ System Reset Complete. All accounts and data have been wiped successfully.");
      window.location.reload();
    } catch (err) {
      console.warn("Wipe error:", err);
      alert("Failed to wipe data. Some records might remain.");
    } finally {
      setIsWipingData(false);
    }
  };

  // Smooth Receive Sound (gentle upward melodic chime: C5 -> E5 -> G5)
  const playSmoothReceiveSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const notes = [
        { freq: 523.25, time: 0.0, dur: 0.28 },
        { freq: 659.25, time: 0.1, dur: 0.28 },
        { freq: 783.99, time: 0.2, dur: 0.45 }
      ];
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);
        gain.gain.setValueAtTime(0.0001, now + time);
        gain.gain.exponentialRampToValueAtTime(0.2, now + time + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + time);
        osc.stop(now + time + dur + 0.05);
      });
    } catch (e) {
      console.warn('Audio receive sound notice:', e);
    }
  }, []);

  // Smooth Alarm Sound (smooth dual-harmonic chime alert: D5 -> A5 -> D6)
  const playSmoothAlarmSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const tones = [
        { freq: 587.33, time: 0.00, dur: 0.22 },
        { freq: 880.00, time: 0.12, dur: 0.24 },
        { freq: 1174.66, time: 0.24, dur: 0.40 }
      ];
      tones.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);
        gain.gain.setValueAtTime(0.0001, now + time);
        gain.gain.exponentialRampToValueAtTime(0.22, now + time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + time);
        osc.stop(now + time + dur + 0.05);
      });
    } catch (e) {
      console.warn('Audio alarm sound notice:', e);
    }
  }, []);

  // Smooth Click Sound (short soft chime: G6)
  const playSmoothClickSound = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1567.98, now); // G6
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      console.warn('Audio click sound notice:', e);
    }
  }, []);

  useEffect(() => {
    (window as any).playClick = playSmoothClickSound;
  }, [playSmoothClickSound]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Camera & Selfie State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const detectionIntervalRef = useRef<number | null>(null);
  const [idDocument, setIdDocument] = useState<string | null>(null);
  const [popDocument, setPopDocument] = useState<string | null>(null);

  // Profile State
  const [profileLocked, setProfileLocked] = useState(false);
  const [isApproved, setIsApproved] = useState(false); // Simulate approval
  const [lastLogoUpdate, setLastLogoUpdate] = useState<number | null>(null);
  const [profileData, setProfileData] = useState({
    name: '',
    surname: '',
    contact: '',
    email: '',
    location: '',
    workTrade: '',
    experience: '',
    reference: '',
    socialLinks: [''],
    applicationChances: 5,
    referrerId: '',
    tenantProfit: 0,
    userProfit: 0,
    tenantSubProfit: 0,
    userSubProfit: 0,
    subscriptionExpiresAt: null as any,
    isFrozen: false,
    isTakenOver: false,
    takenOverBy: '',
    complianceWarningIssuedAt: null as any,
    complianceWarningDeadline: null as any,
    complianceNoticeReason: '',
    hasShownActivation: false,
    tenantSubFee: 100,
    userSubFee: 25,
    bankTransferDetails: '',
    isAvailableForWork: true
  });

  const [showFeesModal, setShowFeesModal] = useState<{ type: 'Tenant' | 'User'; fee: number } | null>(null);

  // Check if current session or user is in referral registration flow or is a registered referral
  const isReferralFlow = Boolean(
    inviterId || 
    (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('ref') || localStorage.getItem('timegig_ref')))
  );

  const isReferralUser = Boolean(
    profileData.referrerId || 
    inviterId || 
    (typeof window !== 'undefined' && localStorage.getItem('timegig_ref'))
  );

  // Referral users and Tenants can explore the GiGs map to see other Tenants' gig posts and local seekers
  const isReferralRegistering = !user && (isReferralFlow || activeTab === 'auth');
  const showGigsIconForUser = true;

  // Gigs State
  const [gigs, setGigs] = useState<any[]>([]);
  const [showGigForm, setShowGigForm] = useState<any | null>(null);
  const [selectedGigLocation, setSelectedGigLocation] = useState<[number, number] | null>(null);
  const [isSearchingForGigLocation, setIsSearchingForGigLocation] = useState(false);
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedGigView, setSelectedGigView] = useState<any | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const debounceTimer = useRef<any>(null);

  // No Mock Data
  const [referrals, setReferrals] = useState<Referral[]>([]);

  const isProfileComplete = () => {
    return profileData.name && profileData.surname && profileData.contact && profileData.email && profileData.location && profileData.workTrade && profileData.experience && profileData.reference;
  }

  // Firestore Error Handling
  enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
  }

  const handleFirestoreError = (error: any, operationType: OperationType, path: string | null) => {
    const errMsg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (errMsg.includes('offline') || errMsg.includes('unavailable') || errMsg.includes('timeout') || errMsg.includes('network') || errMsg.includes('failed to get document')) {
      console.warn(`Firestore operating in offline cache mode for ${operationType} on ${path}`);
      return;
    }
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
      },
      operationType,
      path
    };
    console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
    setError(`Permission Error: ${operationType} on ${path}`);
  };

  // Firebase Auth & User Profile Listener
  useEffect(() => {
    // Capture ref from URL into localStorage on load & check referral welcome
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('timegig_ref', ref);
      setInviterId(ref);
      setShowWelcomeModal(true);
      setActiveTab('auth');
    } else {
      const storedRef = localStorage.getItem('timegig_ref');
      if (storedRef) {
        setInviterId(storedRef);
        if (!sessionStorage.getItem('welcome_dismissed')) {
          setShowWelcomeModal(true);
        }
      }
    }

    if (!auth) return;
    let userDocUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (userDocUnsub) {
        userDocUnsub();
        userDocUnsub = null;
      }

      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const storedRef = localStorage.getItem('timegig_ref') || '';
        
        try {
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            // New user registered via link
            const isMainAdmin = firebaseUser.email === 'timegig2026@gmail.com';
            const initialData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              role: isMainAdmin ? 'Tenant' : 'User', // Bootstrap admin
              isApproved: isMainAdmin,
              createdAt: serverTimestamp(),
              applicationChances: 5,
              referrerId: storedRef,
              tenantProfit: 0,
              userProfit: 0,
              tenantSubProfit: 0,
              userSubProfit: 0,
              subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            };
            await setDoc(userDocRef, initialData).catch(() => null);
            if (storedRef && !sessionStorage.getItem('welcome_dismissed')) {
              setShowWelcomeModal(true);
            }
            if (!isMainAdmin) {
              setActiveTab('activation');
            }
          } else if (!userDoc.data().referrerId && storedRef) {
            await updateDoc(userDocRef, { referrerId: storedRef }).catch(() => null);
          }
        } catch (e: any) {
          console.warn('User doc initialization operating offline:', e?.message || e);
        }

        // Live real-time listener on user profile
        userDocUnsub = onSnapshot(userDocRef, (docSnap) => {
          if (!docSnap.exists()) return;
          const data = docSnap.data();
          const finalReferrerId = data.referrerId || storedRef;

          const nowApproved = Boolean(data.isApproved);
          setIsApproved((prevApproved) => {
            // If user transitioned to approved and is not the main tenant bootstrap, notify them!
            if (nowApproved && !prevApproved && firebaseUser.email !== 'timegig2026@gmail.com') {
              if (!data.hasShownActivation) {
                setShowReferralActivatedPopup(true);
                updateDoc(userDocRef, { hasShownActivation: true }).catch(() => null);
              } else {
                setShowWelcomeBackPopup(true);
              }
              setVerificationStep(null);
              const isProfileDone = Boolean(data.name && data.surname && data.contact && data.email && data.location && data.workTrade && data.experience && data.reference);
              if (isProfileDone) {
                setActiveTab('map');
              }
            }
            return nowApproved;
          });

          setUserRole(data.role || 'User');
          setProfileLocked(data.profileLocked || false);
          setLastLogoUpdate(data.lastLogoUpdate || null);
          const tenantSubProfit = data.tenantSubProfit ?? (data.tenantProfit ?? 0);
          const userSubProfit = data.userSubProfit ?? (data.userProfit ?? 0);
          setProfileData({
            name: data.name || '',
            surname: data.surname || '',
            contact: data.contact || '',
            email: data.email || firebaseUser.email || '',
            location: data.location || '',
            workTrade: data.workTrade || '',
            experience: data.experience || '',
            reference: data.reference || '',
            socialLinks: data.socialLinks || [''],
            applicationChances: data.applicationChances ?? 5,
            referrerId: finalReferrerId,
            tenantProfit: data.tenantProfit ?? 0,
            userProfit: data.userProfit ?? 0,
            tenantSubProfit: tenantSubProfit,
            userSubProfit: userSubProfit,
            subscriptionExpiresAt: data.subscriptionExpiresAt || null,
            isFrozen: Boolean(data.isFrozen),
            isTakenOver: Boolean(data.isTakenOver),
            takenOverBy: data.takenOverBy || '',
            complianceWarningIssuedAt: data.complianceWarningIssuedAt || null,
            complianceWarningDeadline: data.complianceWarningDeadline || null,
            complianceNoticeReason: data.complianceNoticeReason || '',
            hasShownActivation: data.hasShownActivation || false,
            tenantSubFee: data.tenantSubFee ?? 100,
            userSubFee: data.userSubFee ?? 25,
            bankTransferDetails: data.bankTransferDetails || '',
            isAvailableForWork: data.isAvailableForWork !== false
          });
          if (data.photoURL) setSelfieImage(data.photoURL);

          if (typeof data.isSatellite === 'boolean') {
            try {
              const localSaved = localStorage.getItem('timegig_is_satellite');
              if (localSaved === null) {
                setIsSatellite(data.isSatellite);
                localStorage.setItem('timegig_is_satellite', String(data.isSatellite));
              }
            } catch (e) {
              console.warn('Satellite sync notice:', e);
            }
          }
          
          // Show welcome back on login if already approved
          if (nowApproved && !sessionStorage.getItem('login_greeted')) {
            setShowWelcomeBackPopup(true);
            sessionStorage.setItem('login_greeted', 'true');
          }
        }, (err) => {
          console.warn('User listener offline notice:', err?.message || err);
        });
      } else {
        // Reset states on logout
        setUserRole('User');
        setIsApproved(false);
        setSelfieImage(null);
        setProfileData({
          name: '', surname: '', contact: '', email: '', location: '',
          workTrade: '', experience: '', reference: '', socialLinks: [''],
          applicationChances: 5, referrerId: '', tenantProfit: 0, userProfit: 0,
          tenantSubProfit: 0, userSubProfit: 0, subscriptionExpiresAt: null,
          isFrozen: false, isTakenOver: false, takenOverBy: '',
          complianceWarningIssuedAt: null, complianceWarningDeadline: null, complianceNoticeReason: '',
          hasShownActivation: false,
          tenantSubFee: 100,
          userSubFee: 25,
          bankTransferDetails: '',
          isAvailableForWork: true
        });
        sessionStorage.removeItem('login_greeted');
      }
    });

    return () => {
      unsubscribe();
      if (userDocUnsub) userDocUnsub();
    };
  }, []);

  // Listen for referrals if Tenant
  useEffect(() => {
    if (!db || !user || userRole !== 'Tenant') {
      setReferrals([]);
      return;
    }
    // Listen for verifications submitted by users referred by this tenant (or all for main tenant timegig2026@gmail.com)
    const path = 'verifications';
    const q = user.email === 'timegig2026@gmail.com'
      ? query(collection(db, path))
      : query(collection(db, path), where('referrerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let hasNewApplication = false;
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !isInitialReferralsLoadRef.current) {
          const data = change.doc.data();
          if (data.userId !== user.uid) {
            hasNewApplication = true;
          }
        }
      });

      if (isInitialReferralsLoadRef.current) {
        isInitialReferralsLoadRef.current = false;
      } else if (hasNewApplication) {
        playSmoothReceiveSound();
      }

      const refs: Referral[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.userId === user.uid) return;
        refs.push({
          id: doc.id,
          userId: data.userId || '',
          name: data.userName || 'Applicant',
          type: data.type || 'User',
          selfie: data.selfie || '',
          idDoc: data.idDoc || '', 
          pop: data.pop || '', 
          date: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString() : 'Recently',
          status: data.status || 'pending',
          isViewed: data.isViewed || false,
          isFrozen: data.isFrozen || false,
          subscriptionExpiresAt: data.subscriptionExpiresAt || null,
          activatedAt: data.activatedAt || null,
          plan: data.plan || (data.type === 'Tenant' ? 'Tenant Sub' : 'User Sub'),
          referrerId: data.referrerId || '',
          createdAtMs: data.createdAt?.toDate ? data.createdAt.toDate().getTime() : (data.createdAt ? new Date(data.createdAt).getTime() : Date.now()),
          isManagedByMainAdmin: Boolean(data.isManagedByMainAdmin),
          takenOverBy: data.takenOverBy || ''
        });
      });
      setReferrals(refs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsubscribe();
  }, [user, userRole, playSmoothReceiveSound]);

  // Listen for all tenant accounts when Main Tenant timegig2026@gmail.com is logged in
  useEffect(() => {
    if (!db || !user || user.email?.toLowerCase() !== 'timegig2026@gmail.com') {
      setAllTenants([]);
      return;
    }
    const qTenants = query(collection(db, 'users'), where('role', '==', 'Tenant'));
    const unsubscribe = onSnapshot(qTenants, (snapshot) => {
      const tenants: TenantAccount[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.email?.toLowerCase() === 'timegig2026@gmail.com') return; // root admin
        tenants.push({
          uid: docSnap.id,
          email: data.email || '',
          name: data.name || '',
          surname: data.surname || '',
          contact: data.contact || '',
          location: data.location || '',
          role: data.role || 'Tenant',
          isApproved: data.isApproved ?? true,
          isFrozen: Boolean(data.isFrozen),
          isTakenOver: Boolean(data.isTakenOver),
          takenOverBy: data.takenOverBy || '',
          takenOverAt: data.takenOverAt || null,
          subscriptionExpiresAt: data.subscriptionExpiresAt || null,
          tenantProfit: data.tenantProfit ?? 0,
          userProfit: data.userProfit ?? 0,
          tenantSubProfit: data.tenantSubProfit ?? 0,
          userSubProfit: data.userSubProfit ?? 0,
          complianceWarningIssuedAt: data.complianceWarningIssuedAt || null,
          complianceWarningDeadline: data.complianceWarningDeadline || null,
          complianceNoticeReason: data.complianceNoticeReason || '',
          createdAt: data.createdAt || null,
          originalTenantEmail: data.originalTenantEmail || '',
          originalTenantName: data.originalTenantName || ''
        });
      });
      setAllTenants(tenants);
    }, (error) => {
      console.warn('Tenants collection offline notice:', error);
    });
    return () => unsubscribe();
  }, [user]);

  // Listen for all users for Seekers feature and Overseer center
  useEffect(() => {
    if (!db || !user) {
      setAllUsersList([]);
      return;
    }
    const qUsers = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(qUsers, (snapshot) => {
      const usersArr: any[] = [];
      snapshot.forEach((docSnap) => {
        usersArr.push({ uid: docSnap.id, ...docSnap.data() });
      });
      setAllUsersList(usersArr);
    }, (error) => {
      console.warn('All users collection notice:', error);
    });
    return () => unsubscribe();
  }, [user]);

  // Metric helper for a tenant
  const getTenantMetrics = useCallback((tenant: TenantAccount) => {
    const tenantRefs = referrals.filter(r => r.referrerId === tenant.uid && r.userId !== tenant.uid);
    const pendingRefs = tenantRefs.filter(r => r.status === 'pending');
    
    let oldestPendingHours = 0;
    if (pendingRefs.length > 0) {
      const oldestMs = pendingRefs.reduce<number>((min, r) => {
        const ms = r.createdAtMs || Date.now();
        return ms < min ? ms : min;
      }, Date.now());
      oldestPendingHours = Math.max(0, Math.floor((Date.now() - oldestMs) / (1000 * 60 * 60)));
    }

    // Check 24-hour compliance deadline
    let warningDeadlineMs: number | null = null;
    let isWarningActive = false;
    let isWarningExpired = false;

    if (tenant.complianceWarningDeadline) {
      if (typeof tenant.complianceWarningDeadline?.toDate === 'function') {
        warningDeadlineMs = tenant.complianceWarningDeadline.toDate().getTime();
      } else if (tenant.complianceWarningDeadline instanceof Date) {
        warningDeadlineMs = tenant.complianceWarningDeadline.getTime();
      } else if (typeof tenant.complianceWarningDeadline === 'number') {
        warningDeadlineMs = tenant.complianceWarningDeadline;
      } else {
        const parsed = new Date(tenant.complianceWarningDeadline).getTime();
        warningDeadlineMs = isNaN(parsed) ? null : parsed;
      }

      if (warningDeadlineMs) {
        if (Date.now() < warningDeadlineMs) {
          isWarningActive = true;
        } else {
          isWarningExpired = true;
        }
      }
    }

    // Delinquent if pending referrals unattended for >= 24h, OR warning has expired without resolution
    const isDelinquent = (pendingRefs.length > 0 && oldestPendingHours >= 24) || isWarningExpired;

    return {
      totalRefs: tenantRefs.length,
      pendingCount: pendingRefs.length,
      oldestPendingHours,
      isDelinquent,
      isWarningActive,
      isWarningExpired,
      warningDeadlineMs,
      pendingRefs
    };
  }, [referrals]);

  // Delinquent, warned, frozen, and taken-over counts for main tenant
  const delinquentTenants = allTenants.filter(t => !t.isTakenOver && getTenantMetrics(t).isDelinquent);
  const warnedTenants = allTenants.filter(t => !t.isTakenOver && getTenantMetrics(t).isWarningActive);
  const frozenTenants = allTenants.filter(t => t.isFrozen);
  const takenOverTenants = allTenants.filter(t => t.isTakenOver);

  // Play sound alert when delinquent count increases for main tenant
  useEffect(() => {
    if (!isMainTenant) return;
    const count = delinquentTenants.length;
    if (count > previousDelinquentCountRef.current) {
      playSmoothAlarmSound();
    }
    previousDelinquentCountRef.current = count;
  }, [delinquentTenants.length, isMainTenant, playSmoothAlarmSound]);

  // Auto-dismiss admin toast
  useEffect(() => {
    if (!adminNotificationToast) return;
    const timer = setTimeout(() => {
      setAdminNotificationToast(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [adminNotificationToast]);

  // Auto-dismiss promo success toast
  useEffect(() => {
    if (!promoSuccessToast) return;
    const timer = setTimeout(() => {
      setPromoSuccessToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [promoSuccessToast]);

  // One-time global profit reset for Main Admin
  useEffect(() => {
    if (isMainTenant && !sessionStorage.getItem('global_profit_reset_done')) {
      const reset = async () => {
        try {
          // Reset Platform Stats
          await setDoc(doc(db, 'system', 'stats'), {
            tenantProfit: 0,
            userProfit: 0,
            totalReferrals: stats.totalReferrals
          }, { merge: true });
          
          // Reset Main Admin's own profit fields
          await updateDoc(doc(db, 'users', user!.uid), {
            tenantProfit: 0,
            userProfit: 0,
            tenantSubProfit: 0,
            userSubProfit: 0
          });
          
          sessionStorage.setItem('global_profit_reset_done', 'true');
          console.log('Global and admin profit balance reset successfully.');
        } catch (e) {
          console.warn('Global reset notice:', e);
        }
      };
      reset();
    }
  }, [isMainTenant, user, stats.totalReferrals]);

  // Main Admin Action Handlers
  const handleIssue24hWarning = async (tenant: TenantAccount) => {
    if (!user || user.email?.toLowerCase() !== 'timegig2026@gmail.com') return;
    try {
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await updateDoc(doc(db, 'users', tenant.uid), {
        complianceWarningIssuedAt: serverTimestamp(),
        complianceWarningDeadline: deadline,
        complianceNoticeReason: 'Unreviewed pending referral applications past 24-hour response requirement.'
      });
      playSmoothAlarmSound();
      setAdminNotificationToast({
        title: '24-Hour Notice Issued',
        message: `24-hour compliance warning issued to ${tenant.email}. They have 24 hours to get their account in order.`
      });
    } catch (err: any) {
      console.warn('Issue warning error:', err);
      setError(err?.message || 'Failed to issue 24-hour notice.');
    }
  };

  const handleFreezeTenantAccount = async (tenant: TenantAccount) => {
    if (!user || user.email?.toLowerCase() !== 'timegig2026@gmail.com') return;
    try {
      const newFrozen = !tenant.isFrozen;
      await updateDoc(doc(db, 'users', tenant.uid), {
        isFrozen: newFrozen,
        frozenAt: newFrozen ? serverTimestamp() : null,
        frozenBy: newFrozen ? 'timegig2026@gmail.com' : null
      });
      if (newFrozen) playSmoothAlarmSound();
      else playSmoothReceiveSound();
      setAdminNotificationToast({
        title: newFrozen ? 'Tenant Account Frozen' : 'Tenant Account Unfrozen',
        message: `${tenant.email} is now ${newFrozen ? 'frozen (blocked from tenant actions)' : 'unfrozen and active'}.`
      });
    } catch (err: any) {
      console.warn('Freeze error:', err);
      setError(err?.message || 'Failed to freeze/unfreeze tenant account.');
    }
  };

  const handleResetTenantAccountSubscription = async (tenant: TenantAccount) => {
    if (!user || user.email?.toLowerCase() !== 'timegig2026@gmail.com') return;
    try {
      let currentExpiryMs: number;
      const currentExpiry = tenant.subscriptionExpiresAt;
      if (currentExpiry?.toDate) {
        currentExpiryMs = currentExpiry.toDate().getTime();
      } else if (currentExpiry instanceof Date) {
        currentExpiryMs = currentExpiry.getTime();
      } else if (typeof currentExpiry === 'number') {
        currentExpiryMs = currentExpiry;
      } else {
        currentExpiryMs = Date.now();
      }

      const baseTime = currentExpiryMs < Date.now() ? Date.now() : currentExpiryMs;
      const newExpiresAt = new Date(baseTime + 30 * 24 * 60 * 60 * 1000);

      await updateDoc(doc(db, 'users', tenant.uid), {
        subscriptionExpiresAt: newExpiresAt,
        isApproved: true,
        isFrozen: false
      });

      playSmoothReceiveSound();
      setAdminNotificationToast({
        title: 'Subscription Countdown Reset / Extended',
        message: `Tenant subscription for ${tenant.email} has been extended by 30 days (Active until ${newExpiresAt.toLocaleDateString()}) after payment confirmation.`
      });
    } catch (err: any) {
      console.warn('Reset subscription error:', err);
      setError(err?.message || 'Failed to reset tenant subscription countdown.');
    }
  };

  const handleTakeoverTenant = async (tenant: TenantAccount) => {
    if (!user || user.email?.toLowerCase() !== 'timegig2026@gmail.com') return;
    const confirmed = window.confirm(
      `Take over ${tenant.name || ''} (${tenant.email})'s tenant account?\n\n` +
      `• Account details will update to Main Administration (timegig2026@gmail.com)\n` +
      `• All their referral applications will be routed directly to you\n` +
      `• You will receive all subscription payments and profit commissions directly\n` +
      `• The tenant's privileges will be revoked due to non-management past the 24-hour deadline.`
    );
    if (!confirmed) return;

    try {
      // 1. Reassign tenant's user profile to main admin
      await updateDoc(doc(db, 'users', tenant.uid), {
        name: 'TimeGiG Root Admin',
        surname: 'Overseer',
        email: 'timegig2026@gmail.com',
        contact: '+27 TimeGiG Admin',
        location: 'TimeGiG Administration HQ',
        payoutBeneficiary: 'timegig2026@gmail.com',
        popRecipient: 'timegig2026@gmail.com',
        isTakenOver: true,
        takenOverBy: 'timegig2026@gmail.com',
        takenOverAt: serverTimestamp(),
        isManagedByMainAdmin: true,
        originalTenantEmail: tenant.email,
        originalTenantName: `${tenant.name || ''} ${tenant.surname || ''}`.trim()
      });

      // 2. Reassign all referral verifications of this tenant to main admin
      const tenantRefs = referrals.filter(r => r.referrerId === tenant.uid);
      for (const ref of tenantRefs) {
        await updateDoc(doc(db, 'verifications', ref.id), {
          referrerId: user.uid,
          isManagedByMainAdmin: true,
          takenOverBy: 'timegig2026@gmail.com',
          takenOverAt: serverTimestamp()
        }).catch(err => console.warn('Ref takeover notice:', err));
      }

      playSmoothReceiveSound();
      setAdminNotificationToast({
        title: 'Tenant Account Taken Over',
        message: `Account of ${tenant.email} is now fully managed by timegig2026@gmail.com. All subscription payments and referral verifications now route directly to you.`
      });
    } catch (err: any) {
      console.warn('Takeover error:', err);
      setError(err?.message || 'Failed to take over tenant account.');
    }
  };

  const seedDemoDelinquentTenant = async () => {
    if (!user || user.email?.toLowerCase() !== 'timegig2026@gmail.com') return;
    try {
      const demoTenantId = 'demo_tenant_' + Date.now().toString().slice(-4);
      const demoUserId = 'demo_seeker_' + Date.now().toString().slice(-4);
      const past28Hours = new Date(Date.now() - 28 * 60 * 60 * 1000);

      // Create demo tenant
      await setDoc(doc(db, 'users', demoTenantId), {
        uid: demoTenantId,
        email: 'tenant.smith@gmail.com',
        name: 'Sarah',
        surname: 'Smith',
        contact: '+27 82 555 1234',
        location: 'Cape Town Central',
        role: 'Tenant',
        isApproved: true,
        isFrozen: false,
        isTakenOver: false,
        tenantSubProfit: 300,
        userSubProfit: 125,
        subscriptionExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        createdAt: past28Hours
      });

      // Create a pending referral for this tenant created 28 hours ago
      await addDoc(collection(db, 'verifications'), {
        userId: demoUserId,
        userName: 'David Miller',
        referrerId: demoTenantId,
        type: 'User',
        status: 'pending',
        isViewed: false,
        isFrozen: false,
        selfie: '/src/assets/images/annual_subscription_hero_1793265786343.jpg',
        idDoc: '/src/assets/images/monthly_subscription_hero_1793265786780.jpg',
        pop: '/src/assets/images/annual_subscription_hero_1793265786343.jpg',
        createdAt: past28Hours,
        plan: 'User Sub'
      });

      playSmoothReceiveSound();
      setAdminNotificationToast({
        title: 'Demo Tenant Created',
        message: 'Created sample tenant (tenant.smith@gmail.com) with a referral pending for 28 hours.'
      });
    } catch (err: any) {
      console.warn('Seed demo notice:', err);
      setError(err?.message || 'Failed to seed sample tenant.');
    }
  };

  // Seeker availability toggle handler
  const currentUserAvailability = profileData.isAvailableForWork !== false;
  const handleToggleMyAvailability = async () => {
    if (!user) return;
    try {
      const newStatus = !currentUserAvailability;
      await updateDoc(doc(db, 'users', user.uid), {
        isAvailableForWork: newStatus
      });
      setProfileData((prev: any) => ({ ...prev, isAvailableForWork: newStatus }));
      playSmoothReceiveSound();
    } catch (err) {
      console.warn('Toggle availability notice:', err);
    }
  };

  // Auto-cleanup any demo / mock seekers from Firestore
  useEffect(() => {
    if (!db) return;
    const mockIds = [
      'seeker_sipho_001',
      'seeker_thandiwe_002',
      'seeker_johan_003',
      'seeker_david_004'
    ];
    mockIds.forEach(id => {
      deleteDoc(doc(db, 'users', id)).catch(() => null);
    });
  }, [db]);

  // Identify demo or mock users
  const isDemoOrMockUser = useCallback((u: any) => {
    if (!u) return true;
    const uid = String(u.uid || '');
    const email = String(u.email || '').toLowerCase();
    const name = String(u.name || '').toLowerCase();
    return (
      uid.startsWith('seeker_') ||
      uid.startsWith('demo_') ||
      email.includes('example.com') ||
      email.includes('@demo.') ||
      name.includes('demo') ||
      Boolean(u.isDemo) ||
      Boolean(u.isMock)
    );
  }, []);

  // Real, verified seekers only (no demo or mock users)
  const filteredSeekers = useMemo(() => {
    return allUsersList.filter(u => {
      if (user && u.uid === user.uid) return false;
      if (isDemoOrMockUser(u)) return false;
      const searchLower = seekerSearchQuery.trim().toLowerCase();
      const matchesSearch = !searchLower || 
        `${u.name || ''} ${u.surname || ''}`.toLowerCase().includes(searchLower) ||
        (u.location || '').toLowerCase().includes(searchLower) ||
        (u.workTrade || '').toLowerCase().includes(searchLower) ||
        (u.experience || '').toLowerCase().includes(searchLower);
      
      const matchesTrade = seekerTradeFilter === 'All' || u.workTrade === seekerTradeFilter;
      return matchesSearch && matchesTrade;
    });
  }, [allUsersList, user, isDemoOrMockUser, seekerSearchQuery, seekerTradeFilter]);

  // City and address coordinate mappings for local seekers on the live map
  const CITY_COORDS: Record<string, [number, number]> = useMemo(() => ({
    'johannesburg': [-26.2041, 28.0473],
    'cape town': [-33.9249, 18.4241],
    'pretoria': [-25.7479, 28.2293],
    'durban': [-29.8587, 31.0218],
    'sandton': [-26.1076, 28.0567],
    'soweto': [-26.2678, 27.8585],
    'bloemfontein': [-29.0852, 26.1596],
    'gqeberha': [-33.9608, 25.6022],
    'port elizabeth': [-33.9608, 25.6022],
    'centurion': [-25.8603, 28.1895],
    'midrand': [-25.9992, 28.1263],
    'randburg': [-26.0936, 27.9947],
    'bellville': [-33.8943, 18.6294],
    'stellenbosch': [-33.9321, 18.8602],
    'east london': [-33.0153, 27.8916],
    'polokwane': [-23.9045, 29.4688],
    'nelspruit': [-25.4753, 30.9694],
    'mbombela': [-25.4753, 30.9694],
    'kimberley': [-28.7282, 24.7499],
    'pietermaritzburg': [-29.6006, 30.3794],
    'kempton park': [-26.1042, 28.2323],
    'roodepoort': [-26.1625, 27.8725],
    'boksburg': [-26.2125, 28.2586],
    'benoni': [-26.1883, 28.3206],
    'rustenburg': [-25.6676, 27.2421],
    'george': [-33.9630, 22.4617],
    'paarl': [-33.7342, 18.9621],
    'somerset west': [-34.0757, 18.8433],
    'germiston': [-26.2254, 28.1691],
    'vanderbijlpark': [-26.7117, 27.8379],
    'vereeniging': [-26.6731, 27.9261],
    'witbank': [-25.8728, 29.2332],
    'emalahleni': [-25.8728, 29.2332],
    'potchefstroom': [-26.7145, 27.0970],
    'welkom': [-27.9831, 26.7351],
    'umhlanga': [-29.7276, 31.0854],
    'ballito': [-29.5390, 31.2144]
  }), []);

  const getUserCoordinates = useCallback((u: any): [number, number] | null => {
    if (Array.isArray(u.coordinates) && u.coordinates.length === 2) {
      const lat = Number(u.coordinates[0]);
      const lng = Number(u.coordinates[1]);
      if (validateCoords(lat, lng)) return [lat, lng];
    }
    if (Array.isArray(u.locationCoords) && u.locationCoords.length === 2) {
      const lat = Number(u.locationCoords[0]);
      const lng = Number(u.locationCoords[1]);
      if (validateCoords(lat, lng)) return [lat, lng];
    }
    if (typeof u.location === 'string' && u.location.trim().length > 0) {
      const match = u.location.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (validateCoords(lat, lng)) return [lat, lng];
      }
      const locLower = u.location.toLowerCase();
      for (const [city, coords] of Object.entries(CITY_COORDS)) {
        if (locLower.includes(city)) {
          return coords;
        }
      }
      if (locLower.includes('gauteng')) return [-26.15, 28.05];
      if (locLower.includes('western cape')) return [-33.92, 18.42];
      if (locLower.includes('kwazulu') || locLower.includes('kzn')) return [-29.85, 31.02];
      if (locLower.includes('eastern cape')) return [-33.96, 25.60];
      if (locLower.includes('free state')) return [-29.08, 26.15];
      if (locLower.includes('mpumalanga')) return [-25.47, 30.96];
      if (locLower.includes('limpopo')) return [-23.90, 29.46];
      if (locLower.includes('north west')) return [-25.66, 27.24];
      if (locLower.includes('northern cape')) return [-28.72, 24.74];
    }
    // Fallback if seeker has trade or is available: derive stable coords in SA based on uid
    if (u.workTrade || u.isAvailableForWork !== false) {
      const uidStr = String(u.uid || 'seeker');
      let hash = 0;
      for (let i = 0; i < uidStr.length; i++) {
        hash = (hash << 5) - hash + uidStr.charCodeAt(i);
        hash |= 0;
      }
      const hubs: [number, number][] = [
        [-26.2041, 28.0473], // Johannesburg
        [-33.9249, 18.4241], // Cape Town
        [-25.7479, 28.2293], // Pretoria
        [-29.8587, 31.0218], // Durban
      ];
      const hub = hubs[Math.abs(hash) % hubs.length];
      const jitterLat = ((Math.abs(hash * 31) % 1000) / 10000) - 0.05;
      const jitterLng = ((Math.abs(hash * 17) % 1000) / 10000) - 0.05;
      return [hub[0] + jitterLat, hub[1] + jitterLng];
    }
    return null;
  }, [CITY_COORDS]);

  // Real registered Seekers with valid locations to display on the live map
  const seekersOnMap = useMemo(() => {
    return allUsersList.filter(u => {
      if (user && u.uid === user.uid) return false;
      if (isDemoOrMockUser(u)) return false;
      const hasTradeOrAvailable = Boolean(u.workTrade || u.isAvailableForWork !== false);
      if (!hasTradeOrAvailable) return false;
      return getUserCoordinates(u) !== null;
    });
  }, [allUsersList, user, isDemoOrMockUser, getUserCoordinates]);

  // Automatically sync user's live position to their Firestore profile so other Tenants see them on the map
  useEffect(() => {
    if (user && position && db) {
      updateDoc(doc(db, 'users', user.uid), {
        coordinates: position,
        lastActive: serverTimestamp()
      }).catch(() => null);
    }
  }, [user, position]);

  const filteredTenants = allTenants.filter(t => {
    if (overseerFilter === 'delinquent') return !t.isTakenOver && getTenantMetrics(t).isDelinquent;
    if (overseerFilter === 'warned') return !t.isTakenOver && getTenantMetrics(t).isWarningActive;
    if (overseerFilter === 'frozen') return t.isFrozen;
    if (overseerFilter === 'taken_over') return t.isTakenOver;
    return true;
  });

  // Listen for Gigs
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'gigs'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let hasNewGig = false;
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !isInitialGigsLoadRef.current) {
          hasNewGig = true;
        }
      });

      if (isInitialGigsLoadRef.current) {
        isInitialGigsLoadRef.current = false;
      } else if (hasNewGig) {
        playSmoothAlarmSound();
      }

      const gs: any[] = [];
      snapshot.forEach((doc) => {
        gs.push({ id: doc.id, ...doc.data() });
      });
      setGigs(gs);
    }, (err) => {
      console.warn('Gigs snapshot listener notice:', err);
    });
    return () => unsubscribe();
  }, [playSmoothAlarmSound]);

  // Listen for system stats & signup targets
  useEffect(() => {
    if (!db || !user) return;
    const path = 'system/platform_stats';
    const unsubscribe = onSnapshot(doc(db, 'system', 'platform_stats'), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setStats({
          tenantProfit: data.tenantProfit || 0,
          userProfit: data.userProfit || 0,
          totalReferrals: data.totalReferrals || 0,
          tenantSubFee: data.tenantSubFee ?? 100,
          userSubFee: data.userSubFee ?? 25,
          tenantSignupTarget: data.tenantSignupTarget ?? 50,
          userSubSignupTarget: data.userSubSignupTarget ?? 200
        });
      } else if (userRole === 'Tenant') {
        // Initialize stats if missing and user is Tenant
        setDoc(docSnapshot.ref, {
          tenantProfit: 0,
          userProfit: 0,
          totalReferrals: 0,
          tenantSubFee: 100,
          userSubFee: 25,
          tenantSignupTarget: 50,
          userSubSignupTarget: 200
        }, { merge: true }).catch(e => console.warn('Init stats notice:', e));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsubscribe();
  }, [user, userRole]);

  // Listen for Inbox Messages
  const isInitialMessagesLoadRef = useRef(true);
  useEffect(() => {
    if (!db || !user) {
      setMessages([]);
      return;
    }
    const isMain = user.email?.trim().toLowerCase() === 'timegig2026@gmail.com';
    const canManage = isMain || userRole === 'Tenant';
    const q = canManage
      ? query(collection(db, 'messages'))
      : query(collection(db, 'messages'), where('recipientId', 'in', [user.uid, 'all']));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let hasNewMessage = false;
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !isInitialMessagesLoadRef.current) {
          const data = change.doc.data();
          if (data.senderId !== user.uid) {
            hasNewMessage = true;
          }
          if (data.type === 'gig_hired' && data.gigLocation) {
            setPosition(data.gigLocation);
            setActiveAcceptedGig({
              id: data.gigId || '',
              title: data.gigTitle || 'Gig Destination',
              location: data.gigLocation,
              budget: data.budget,
              ownerName: data.senderName
            });
            setActiveTab('map');
          }
        }
      });

      if (isInitialMessagesLoadRef.current) {
        isInitialMessagesLoadRef.current = false;
      } else if (hasNewMessage) {
        playSmoothReceiveSound();
      }

      const allRawMsgs: any[] = [];
      snapshot.forEach((docSnap) => {
        allRawMsgs.push({ id: docSnap.id, ...docSnap.data() });
      });

      // Sort by newest first
      allRawMsgs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.toMillis?.() || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });

      // Deduplicate messages by ID and content key (subject + body)
      const msgs: any[] = [];
      const seenIds = new Set<string>();
      const seenContentKeys = new Set<string>();

      for (const msg of allRawMsgs) {
        if (seenIds.has(msg.id)) continue;
        seenIds.add(msg.id);

        const contentKey = `${(msg.subject || '').trim().toLowerCase()}:::${(msg.body || '').trim().toLowerCase()}`;
        if (contentKey !== ':::' && seenContentKeys.has(contentKey)) {
          continue; // Skip duplicate content copies
        }
        seenContentKeys.add(contentKey);
        msgs.push(msg);
      }

      setMessages(msgs);
    }, (error) => {
      console.warn('Inbox listener notice:', error);
    });
    return () => unsubscribe();
  }, [user, playSmoothReceiveSound]);

  // Listen for Feedback submissions
  useEffect(() => {
    if (!db || !user) {
      setFeedbacks([]);
      return;
    }
    const isMain = user.email?.trim().toLowerCase() === 'timegig2026@gmail.com';
    const q = isMain
      ? query(collection(db, 'feedback'))
      : query(collection(db, 'feedback'), where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.toMillis?.() || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });
      setFeedbacks(list);
    }, (error) => {
      console.warn('Feedback listener notice:', error);
    });
    return () => unsubscribe();
  }, [user]);



  const handleLogin = async () => {
    setAuthError(null);
    if (!auth) {
      setAuthError('Authentication service is not available.');
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, provider);
      if (res?.user) {
        const isMainAdmin = res.user.email?.toLowerCase() === 'timegig2026@gmail.com';
        const userDocRef = doc(db, 'users', res.user.uid);
        const userDoc = await getDoc(userDocRef).catch(() => null);
        const storedRef = (typeof window !== 'undefined' ? localStorage.getItem('timegig_ref') : null) || inviterId;
        const isApprv = isMainAdmin || Boolean(userDoc?.data()?.isApproved);
        if (isMainAdmin) {
          setActiveTab('tenant');
        } else if (storedRef || !isApprv) {
          setActiveTab('activation');
        } else {
          setActiveTab('map');
        }
      }
    } catch (err: any) {
      console.warn('Google sign-in popup notice:', err?.code || err?.message);
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setAuthError(err?.message || 'Google sign-in failed. Please use email sign in below.');
      }
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword) {
      setAuthError('Please enter both email and password.');
      return;
    }
    setIsAuthSubmitting(true);
    setAuthError(null);
    try {
      try {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      } catch (signInErr: any) {
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
          await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
        } else {
          throw signInErr;
        }
      }
      const isMainAdmin = authEmail.trim().toLowerCase() === 'timegig2026@gmail.com';
      const storedRef = (typeof window !== 'undefined' ? localStorage.getItem('timegig_ref') : null) || inviterId;
      if (isMainAdmin) {
        setActiveTab('tenant');
      } else if (storedRef || !isApproved) {
        setActiveTab('activation');
      } else {
        setActiveTab('map');
      }
    } catch (err: any) {
      console.warn('Email auth notice:', err);
      setAuthError(err?.message || 'Authentication error. Please check your credentials.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('timegig_demo_email');
    if (auth) {
      try {
        await signOut(auth);
      } catch (err) {
        console.warn('Logout notice:', err);
      }
    }
    setUser(null);
    setUserRole('User');
    setIsApproved(false);
    setActiveTab('map');
  };

  const validateCoords = (lat: number, lng: number): boolean => {
    return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  };

  const requestLocation = useCallback((isInitial = false) => {
    if (!navigator.geolocation) {
      if (!isInitial) setError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setError(null);
    setIsPermissionsBlocked(false);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (validateCoords(latitude, longitude)) {
          setPosition([latitude, longitude]);
          setSearchPosition(null);
        }
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        if (!isInitial) {
          if (err.message.toLowerCase().includes('permissions policy') || err.code === 1) {
            setIsPermissionsBlocked(true);
          } else {
            setError(err.message);
          }
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    requestLocation(true);
  }, [requestLocation]);

  const fetchSuggestions = async (query: string) => {
    if (!query) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
      const data = await response.json();
      setSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch (err) {
      console.warn('Failed to fetch suggestions', err);
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(query);
    }, 500);
  };

  const handleSearch = async (e: React.FormEvent | string) => {
    if (typeof e !== 'string') e.preventDefault();
    const query = typeof e === 'string' ? e : searchQuery;
    if (!query.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setShowSuggestions(false);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        const newPos: [number, number] = [parseFloat(lat), parseFloat(lon)];
        if (validateCoords(newPos[0], newPos[1])) {
          setSearchPosition(newPos);
          setSearchQuery('');
          setActiveTab('map');
          
        if (validateCoords(newPos[0], newPos[1])) {
          setSearchPosition(newPos);
          setSearchQuery('');
          setActiveTab('map');
          // Removed automatic gig creation prompt
        }
        }
      } else {
        setSearchError('Location not found.');
      }
    } catch (err) {
      setSearchError('Search failed.');
    } finally {
      setIsSearching(false);
    }
  };

  const startVerification = (plan: string) => {
    setSelectedPlan(plan);
    setVerificationStep('selfie');
  };

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const checkCameraPermissions = useCallback(async () => {
    if (!navigator.permissions || !navigator.permissions.query) return;
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      if (result.state === 'granted') {
        startCamera();
      } else if (result.state === 'denied') {
        setCameraError('Camera access blocked. Please enable it in browser settings.');
      }
      result.onchange = () => {
        if (result.state === 'granted') startCamera();
        else if (result.state === 'denied') setCameraError('Camera access blocked. Please enable it in browser settings.');
      };
    } catch (e) {
      console.warn('Permission query failed', e);
    }
  }, []);

  useEffect(() => {
    if (verificationStep === 'selfie') {
      checkCameraPermissions();
    }
  }, [verificationStep, checkCameraPermissions]);

  const loadModels = useCallback(async () => {
    try {
      const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      ]);
      setIsModelsLoaded(true);
    } catch (e) {
      console.warn('Face detection models failed to load', e);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const startDetection = useCallback(() => {
    if (!videoRef.current || !isModelsLoaded) return;
    const detect = async () => {
      if (videoRef.current && isCameraActive && !selfieImage) {
        const detection = await faceapi.detectSingleFace(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions()
        );
        setIsFaceDetected(!!detection);
      }
      detectionIntervalRef.current = window.requestAnimationFrame(detect);
    };
    detect();
  }, [isModelsLoaded, isCameraActive, selfieImage]);

  useEffect(() => {
    if (isCameraActive && isModelsLoaded) {
      startDetection();
    }
    return () => {
      if (detectionIntervalRef.current) {
        window.cancelAnimationFrame(detectionIntervalRef.current);
      }
    };
  }, [isCameraActive, isModelsLoaded, startDetection]);

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraLoading(true);
    if (!window.isSecureContext) {
      setCameraError('Camera access requires a secure HTTPS connection.');
      setIsCameraLoading(false);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Your browser does not support camera APIs.');
      setIsCameraLoading(false);
      return;
    }
    const timeoutId = setTimeout(() => {
      if (!isCameraActive) {
        setCameraError('Camera initialization timed out.');
        setIsCameraLoading(false);
        stopCamera();
      }
    }, 4000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      clearTimeout(timeoutId);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play()
              .then(() => {
                setIsCameraActive(true);
                setIsCameraLoading(false);
              })
              .catch(e => {
                setCameraError('Tap to enable camera view.');
                setIsCameraLoading(false);
              });
          }
        };
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      setIsCameraLoading(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access denied. Enable in site settings.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera detected.');
      } else if (err.name === 'NotReadableError') {
        setCameraError('Camera already in use.');
      } else {
        setCameraError(`Camera Error: ${err.message || 'Error'}`);
      }
    }
  };

  const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% quality
      };
    });
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        const compressed = await compressImage(dataUrl);
        setSelfieImage(compressed);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result as string);
        setSelfieImage(compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  // Clean up camera
  useEffect(() => {
    if (verificationStep !== 'selfie') stopCamera();
    return () => stopCamera();
  }, [verificationStep, stopCamera]);

  const handleSocialLinkChange = (index: number, value: string) => {
    const newLinks = [...profileData.socialLinks];
    newLinks[index] = value;
    setProfileData({ ...profileData, socialLinks: newLinks });
  };

  const addSocialLink = () => {
    setProfileData({ ...profileData, socialLinks: [...profileData.socialLinks, ''] });
  };

  const autofillLocation = async () => {
    if (position) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${position[0]}&lon=${position[1]}`);
        const data = await res.json();
        const addressName = data.display_name || `${position[0].toFixed(4)}, ${position[1].toFixed(4)}`;
        setProfileData({ ...profileData, location: addressName });
      } catch (e) {
        setProfileData({ ...profileData, location: `${position[0].toFixed(4)}, ${position[1].toFixed(4)}` });
      }
    }
  };

  const saveProfile = () => {
    if (!profileData.name || !profileData.surname || !profileData.contact || !profileData.email || !profileData.workTrade || !profileData.experience || !profileData.reference) {
      setError('Please fill all required fields, including at least one work experience and reference.');
      return;
    }
    setProfileLocked(true);
  };

  const updateProfileLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const now = Date.now();
    const oneMonth = 30 * 24 * 60 * 60 * 1000;
    
    if (lastLogoUpdate && (now - Number(lastLogoUpdate)) < oneMonth) {
      setError('Profile logo can only be updated once a month.');
      return;
    }
    
    const file = e.target.files?.[0];
    if (file && user) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          const compressed = await compressImage(base64);
          await updateDoc(doc(db, 'users', user.uid), {
            photoURL: compressed,
            lastLogoUpdate: now
          });
          setSelfieImage(compressed);
          setLastLogoUpdate(now);
        } catch (err) {
          console.warn('Error updating logo:', err);
          setError('Failed to update profile logo.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRenewReferralSubscription = async (ref: Referral) => {
    try {
      let currentExpiryMs: number;
      if (ref.subscriptionExpiresAt?.toDate) {
        currentExpiryMs = ref.subscriptionExpiresAt.toDate().getTime();
      } else if (ref.subscriptionExpiresAt instanceof Date) {
        currentExpiryMs = ref.subscriptionExpiresAt.getTime();
      } else if (typeof ref.subscriptionExpiresAt === 'number') {
        currentExpiryMs = ref.subscriptionExpiresAt;
      } else {
        currentExpiryMs = Date.now();
      }

      const baseTime = currentExpiryMs < Date.now() ? Date.now() : currentExpiryMs;
      const newExpiresAt = new Date(baseTime + 30 * 24 * 60 * 60 * 1000);

      await updateDoc(doc(db, 'verifications', ref.id), {
        subscriptionExpiresAt: newExpiresAt,
        status: 'active',
        isFrozen: false
      });

      if (ref.userId) {
        await updateDoc(doc(db, 'users', ref.userId), {
          subscriptionExpiresAt: newExpiresAt,
          isApproved: true,
          isFrozen: false
        }).catch(e => console.warn(e));
      }

      setReferrals(prev => prev.map(r => r.id === ref.id ? { ...r, subscriptionExpiresAt: newExpiresAt, status: 'active', isFrozen: false } : r));
      if (referralView && referralView.id === ref.id) {
        setReferralView(prev => prev ? { ...prev, subscriptionExpiresAt: newExpiresAt, status: 'active', isFrozen: false } : null);
      }

      alert(`Tenant subscription successfully extended! Active until ${newExpiresAt.toLocaleDateString()}.`);
    } catch (err) {
      console.warn('Renew subscription notice:', err);
      setError('Failed to extend referral subscription.');
    }
  };

  const handleRenewMyTenantSubscription = async () => {
    if (!user) return;
    try {
      let currentExpiryMs: number;
      const currentExpiry = profileData.subscriptionExpiresAt;
      if (currentExpiry?.toDate) {
        currentExpiryMs = currentExpiry.toDate().getTime();
      } else if (currentExpiry instanceof Date) {
        currentExpiryMs = currentExpiry.getTime();
      } else if (typeof currentExpiry === 'number') {
        currentExpiryMs = currentExpiry;
      } else {
        currentExpiryMs = Date.now();
      }

      const baseTime = currentExpiryMs < Date.now() ? Date.now() : currentExpiryMs;
      const newExpiresAt = new Date(baseTime + 30 * 24 * 60 * 60 * 1000);

      await updateDoc(doc(db, 'users', user.uid), {
        subscriptionExpiresAt: newExpiresAt,
        isApproved: true,
        role: 'Tenant'
      });

      setProfileData(prev => ({
        ...prev,
        subscriptionExpiresAt: newExpiresAt
      }));

      alert(`Your Tenant subscription is renewed and active until ${newExpiresAt.toLocaleDateString()}!`);
    } catch (err) {
      console.warn('Renew own tenant subscription notice:', err);
      setError('Failed to renew Tenant subscription.');
    }
  };

  // Main Tenant: Send promotion messages to referral Tenants and users throughout the app
  const handleSendPromotion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promoSubject.trim() || !promoBody.trim() || !user || !canManagePromotions) return;

    setIsBroadcasting(true);
    setError(null);
    try {
      const subject = promoSubject.trim();
      const body = promoBody.trim();
      const senderName = profileData.name ? `${profileData.name} ${profileData.surname}`.trim() : (isMainTenant ? 'TimeGiG Main Administration' : 'Partner Tenant');
      const senderEmail = user.email || 'system@timegig.app';

      let targetCount = 0;
      let label = 'All Tenants & Users';

      if (promoTargetType === 'all') {
        // Global broadcast to all tenants and users
        await addDoc(collection(db, 'messages'), {
          recipientId: 'all',
          recipientName: 'All Tenants & Users',
          senderId: user.uid,
          senderEmail,
          senderName,
          subject,
          body,
          type: 'promotion',
          targetAudience: 'all',
          isBroadcast: true,
          isRead: false,
          createdAt: serverTimestamp()
        });
        targetCount = allUsersList.length || 1;
        label = 'All Tenants & Users Network';
      } else if (promoTargetType === 'tenants') {
        // Broadcast to referral tenants
        await addDoc(collection(db, 'messages'), {
          recipientId: 'all',
          recipientName: 'Referral Tenants Network',
          senderId: user.uid,
          senderEmail,
          senderName,
          subject,
          body,
          type: 'promotion',
          targetAudience: 'tenants',
          isBroadcast: true,
          isRead: false,
          createdAt: serverTimestamp()
        });

        const tenantUids = allUsersList.filter(u => u.role === 'Tenant' && u.uid !== user.uid).map(u => u.uid);
        for (const tUid of tenantUids) {
          await addDoc(collection(db, 'messages'), {
            recipientId: tUid,
            recipientName: 'Referral Tenants Network',
            senderId: user.uid,
            senderEmail,
            senderName,
            subject,
            body,
            type: 'promotion',
            targetAudience: 'tenants',
            isRead: false,
            createdAt: serverTimestamp()
          });
        }
        targetCount = tenantUids.length;
        label = 'Referral Tenants';
      } else if (promoTargetType === 'users') {
        // Broadcast to referral users
        await addDoc(collection(db, 'messages'), {
          recipientId: 'all',
          recipientName: 'Referral Users Network',
          senderId: user.uid,
          senderEmail,
          senderName,
          subject,
          body,
          type: 'promotion',
          targetAudience: 'users',
          isBroadcast: true,
          isRead: false,
          createdAt: serverTimestamp()
        });

        const userUids = allUsersList.filter(u => u.role !== 'Tenant' && u.uid !== user.uid).map(u => u.uid);
        for (const uUid of userUids) {
          await addDoc(collection(db, 'messages'), {
            recipientId: uUid,
            recipientName: 'Referral Users Network',
            senderId: user.uid,
            senderEmail,
            senderName,
            subject,
            body,
            type: 'promotion',
            targetAudience: 'users',
            isRead: false,
            createdAt: serverTimestamp()
          });
        }
        targetCount = userUids.length;
        label = 'Referral Users';
      } else if (promoTargetType === 'selected') {
        if (selectedPromoRecipientUids.length === 0) {
          setError('Please select at least one recipient from the list.');
          setIsBroadcasting(false);
          return;
        }
        for (const targetUid of selectedPromoRecipientUids) {
          const matchedUser = allUsersList.find(u => u.uid === targetUid);
          const recipientName = matchedUser ? `${matchedUser.name || ''} ${matchedUser.surname || ''}`.trim() || matchedUser.email : 'Selected Member';
          await addDoc(collection(db, 'messages'), {
            recipientId: targetUid,
            recipientName,
            senderId: user.uid,
            senderEmail,
            senderName,
            subject,
            body,
            type: 'promotion',
            isRead: false,
            createdAt: serverTimestamp()
          });
        }
        targetCount = selectedPromoRecipientUids.length;
        label = `${targetCount} Selected Recipient${targetCount === 1 ? '' : 's'}`;
      }

      playSmoothReceiveSound();
      setPromoSubject('');
      setPromoBody('');
      setSelectedPromoRecipientUids([]);
      setPromoSuccessToast(
        `🎉 Promotion message successfully sent to ${label}!`
      );
      setMainTenantInboxTab('direct');
    } catch (err: any) {
      console.warn('Send promotion error:', err);
      setError(err?.message || 'Failed to send promotion to selected recipients.');
    } finally {
      setIsBroadcasting(false);
    }
  };

  // User Feedback and Feature Requests Handler
  const handleSendFeedback = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!feedbackText.trim() || !user) return;

    setIsSubmittingFeedback(true);
    try {
      const text = feedbackText.trim();
      const userName = profileData.name ? `${profileData.name} ${profileData.surname || ''}`.trim() : (user.displayName || 'TimeGiG Member');
      const userEmail = user.email || 'user@timegig.app';

      // 1. Add to dedicated feedback collection in Firestore
      await addDoc(collection(db, 'feedback'), {
        userId: user.uid,
        userName,
        userEmail,
        userRole: userRole || 'User',
        category: feedbackCategory,
        feedbackText: text,
        status: 'new',
        createdAt: serverTimestamp()
      });

      // 2. Add as message for Main Tenant in messages collection
      await addDoc(collection(db, 'messages'), {
        recipientId: 'timegig2026@gmail.com',
        recipientName: 'TimeGiG Main Administration',
        senderId: user.uid,
        senderEmail: userEmail,
        senderName: userName,
        subject: `💡 Feedback: [${feedbackCategory}] from ${userName}`,
        body: text,
        type: 'feedback',
        category: feedbackCategory,
        isRead: false,
        createdAt: serverTimestamp()
      });

      playSmoothReceiveSound();
      setFeedbackText('');
      setFeedbackSuccessToast('🎉 Thank you! Your feedback & feature request has been sent to the Main Tenant.');
      setTimeout(() => setFeedbackSuccessToast(null), 6000);
    } catch (err: any) {
      console.warn('Feedback submit error:', err);
      alert('Failed to send feedback: ' + (err?.message || 'Please try again.'));
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleDeleteFeedback = async (feedbackId: string) => {
    if (!confirm('Delete this feedback submission?')) return;
    try {
      await deleteDoc(doc(db, 'feedback', feedbackId));
    } catch (err) {
      console.warn('Delete feedback error:', err);
    }
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col relative bg-gray-50 font-sans">
      {/* Floating Search Bar */}
      {activeTab === 'map' && (
        <div className="absolute top-4 left-4 right-4 z-[2000] flex flex-col gap-2 pointer-events-none">
          <div className="w-full max-w-lg mx-auto pointer-events-auto bg-white rounded-xl shadow-lg flex flex-col border border-gray-100 overflow-hidden">
            <form 
              onSubmit={handleSearch}
              className="flex items-center p-1"
            >
              <button
                type="button"
                onClick={() => { playSmoothClickSound(); setActiveTab('profile'); setVerificationStep(null); }}
                className="w-10 h-10 rounded-full overflow-hidden border border-gray-100 shadow-sm ml-1 hover:scale-105 transition-all"
                title="Profile"
              >
                {(selfieImage && selfieImage !== "") ? (
                  <img src={selfieImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                    <User className="w-5 h-5" />
                  </div>
                )}
              </button>
              <div className="pl-3 text-gray-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Search location..."
                value={searchQuery}
                onChange={handleQueryChange}
                className="flex-1 px-3 py-2.5 bg-transparent outline-none text-black placeholder-gray-400 text-sm"
              />
              {searchQuery && (
                <button type="button" onClick={() => { playSmoothClickSound(); setSearchQuery(''); setSuggestions([]); setShowSuggestions(false);}} className="p-2 text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={isSearching}
                onClick={playSmoothClickSound}
                className="p-2.5 bg-black text-white rounded-lg transition-all disabled:opacity-50 mr-1"
              >
                {isSearching ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search className="w-5 h-5" />}
              </button>
            </form>
            {showSuggestions && suggestions.length > 0 && (
              <ul className="border-t border-gray-100 max-h-48 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <li 
                    key={index}
                    onClick={() => handleSearch(suggestion.display_name)}
                    className="px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
                  >
                    {suggestion.display_name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {userRole === 'Tenant' && (
            <div className="pointer-events-auto max-w-lg mx-auto w-full space-y-2">
              {/* Tenant 24h Compliance Warning Alert */}
              {profileData.complianceWarningDeadline && !profileData.isTakenOver && !profileData.isFrozen && !isMainTenant && (
                <div 
                  onClick={() => { setActiveTab('tenant'); setShowReferralList(true); }}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-full shadow-xl border border-red-400 flex items-center justify-between gap-3 text-xs font-black cursor-pointer active:scale-95 transition-all animate-pulse"
                >
                  <div className="flex items-center gap-2 truncate">
                    <AlertTriangle className="w-4 h-4 text-white shrink-0" />
                    <span className="truncate">24h Compliance Warning: Review Pending Referrals</span>
                  </div>
                  <TenantComplianceNoticeCountdownPill deadline={profileData.complianceWarningDeadline} />
                </div>
              )}

              {/* Main Tenant Root Overseer Delinquent Accounts Alert */}
              {isMainTenant && delinquentTenants.length > 0 && (
                <div 
                  onClick={() => { setActiveTab('tenant'); setShowReferralList(false); }}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-full shadow-xl border border-red-300 flex items-center justify-between gap-3 text-xs font-black cursor-pointer active:scale-95 transition-all animate-pulse"
                >
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-white" />
                    <span>Root Admin Alert: {delinquentTenants.length} Tenant{delinquentTenants.length === 1 ? '' : 's'} Not Managing Accounts</span>
                  </div>
                  <span className="bg-black/40 px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider">Take Action</span>
                </div>
              )}

              <TenantSubscriptionAlertBanner 
                expiresAt={profileData.subscriptionExpiresAt} 
                onRenew={() => setActiveTab('tenant')} 
                compact={true}
              />
            </div>
          )}

          {/* Active Accepted Gig Navigation Overlay Banner */}
          {activeAcceptedGig && (
            <div className="pointer-events-auto mx-auto max-w-md w-full bg-black text-white p-3.5 px-5 rounded-2xl shadow-2xl border border-emerald-400/60 flex items-center justify-between gap-3 animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md">
                  <MapPin className="w-5 h-5 animate-bounce" />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-white">Active Hired Gig</span>
                    {activeAcceptedGig.budget && <span className="text-xs font-black text-emerald-400">R{activeAcceptedGig.budget}</span>}
                  </div>
                  <h4 className="font-black text-xs text-white truncate max-w-[180px] mt-0.5">{activeAcceptedGig.title}</h4>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    if (activeAcceptedGig.location) {
                      setPosition(activeAcceptedGig.location);
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow active:scale-95 transition-all flex items-center gap-1"
                >
                  <Compass className="w-3 h-3" /> Fly To
                </button>
                <button
                  onClick={() => setActiveAcceptedGig(null)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white rounded-xl"
                  title="Dismiss Banner"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {(inviterId || localStorage.getItem('timegig_ref')) && (
            <button 
              onClick={() => setShowWelcomeModal(true)}
              className="pointer-events-auto mx-auto bg-black text-white px-4 py-2 rounded-full shadow-lg border border-white/20 flex items-center gap-2 text-xs font-bold active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Invited by Tenant • View Referral Benefits</span>
            </button>
          )}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Map View Background Wallpaper */}
        <div className={`absolute inset-0 transition-opacity duration-300 ${activeTab === 'map' ? 'z-10' : 'z-0'}`}>
          <MapContainer
            center={position || [0, 0]}
            zoom={position ? 15 : 2}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            {isSatellite ? <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" /> : <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />}
            <div className="absolute bottom-24 right-4 z-[1000] flex flex-col gap-2 pointer-events-auto">
              <button 
                onClick={() => { playSmoothClickSound(); setShowInbox(true); }}
                className="p-3 bg-white text-black rounded-xl shadow-xl border border-gray-100 flex items-center justify-center transition-all active:scale-95 relative hover:bg-gray-50"
                title="Inbox & Promotions"
              >
                <div className="relative">
                  <Mail className="w-5 h-5" />
                  {messages.some(m => !m.isRead) && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-pulse" />
                  )}
                </div>
              </button>
              {userRole === 'User' && (
                <button 
                  onClick={() => { playSmoothClickSound(); setActiveTab(activeTab === 'shop' ? 'map' : 'shop'); setVerificationStep(null); }} 
                  className={`p-3 rounded-xl shadow-xl border border-gray-100 flex items-center justify-center transition-all active:scale-95 relative ${activeTab === 'shop' ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-50'}`}
                  title="Shop"
                >
                  <ShoppingBag className="w-5 h-5" />
                  <span className="absolute -top-1 -right-2 bg-amber-500 text-white text-[6px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter">CONSTRUCTION</span>
                </button>
              )}
              <ZoomControls isSatellite={isSatellite} setIsSatellite={setIsSatellite} />
              <button
                onClick={() => { playSmoothClickSound(); requestLocation(false); }}
                disabled={isLocating}
                className="p-3 bg-white text-black rounded-xl shadow-xl border border-gray-100 flex items-center justify-center"
              >
                {isLocating ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Compass className="w-5 h-5" />}
              </button>
              <button
                onClick={() => {
                  playSmoothClickSound();
                  if (!isProfileComplete()) {
                    setActiveTab('profile');
                    setError('Please complete your profile before creating a gig.');
                    return;
                  }
                  setIsSelectingLocation(true);
                  setShowGigForm(true);
                }}
                className="p-3 bg-emerald-500 text-white rounded-xl shadow-xl border border-emerald-400 flex items-center justify-center"
                title="Create Gig"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

  // ... rest of the code

            {position && (
              <Marker 
                position={position} 
                icon={L.divIcon({
                  className: 'bg-transparent',
                  html: `<div class="w-10 h-10 rounded-full border-4 border-blue-500 shadow-lg overflow-hidden bg-white flex items-center justify-center ${gigs.some(g => g.userId === user?.uid) ? 'border-emerald-500 ring-2 ring-emerald-300' : ''}">
                    ${(selfieImage || user?.photoURL) ? `<img src="${selfieImage || user?.photoURL}" class="w-full h-full object-cover" />` : `<span class="text-xs font-black text-blue-600">${(profileData.name || user?.displayName || 'Me')[0]}</span>`}
                  </div>`,
                  iconSize: [40, 40],
                  iconAnchor: [20, 20]
                })}
              />
            )}
            {position && !searchPosition && <RecenterMap position={position} />}
            {searchPosition && <Marker position={searchPosition} />}
            {searchPosition && <RecenterMap position={searchPosition} zoom={17} />}
            {showGigForm && <MapClickHandler setLocation={setSelectedGigLocation} setIsSelectingLocation={setIsSelectingLocation} setShowGigForm={setShowGigForm} />}
            {isSelectingLocation && <MapClickHandler setLocation={setSelectedGigLocation} setIsSelectingLocation={setIsSelectingLocation} setShowGigForm={setShowGigForm} />}
            {selectedGigLocation && <Marker position={selectedGigLocation} />}

            {/* Active Accepted Gig Destination Marker */}
            {activeAcceptedGig && activeAcceptedGig.location && (
              <Marker
                position={activeAcceptedGig.location}
                icon={L.divIcon({
                  className: 'bg-transparent',
                  html: `
                    <div class="relative w-12 h-12 rounded-full border-4 border-emerald-400 bg-black shadow-2xl flex items-center justify-center ring-4 ring-emerald-300/50 animate-bounce">
                      <div class="w-4 h-4 rounded-full bg-emerald-400"></div>
                    </div>
                  `,
                  iconSize: [48, 48],
                  iconAnchor: [24, 24]
                })}
              >
                <Popup className="rounded-2xl shadow-xl">
                  <div className="p-3 text-center space-y-2">
                    <span className="bg-emerald-500 text-white font-black text-[9px] uppercase px-2.5 py-1 rounded-full">Gig Destination</span>
                    <h3 className="font-black text-base text-black mt-1">{activeAcceptedGig.title}</h3>
                    {activeAcceptedGig.budget && <p className="text-xs font-black text-emerald-600">Budget: R{activeAcceptedGig.budget}</p>}
                    <button
                      onClick={() => {
                        setPosition(activeAcceptedGig.location);
                      }}
                      className="w-full py-2 bg-black text-white font-black text-xs rounded-xl uppercase tracking-wider"
                    >
                      Navigate Map Here
                    </button>
                  </div>
                </Popup>
              </Marker>
            )}
            {/* Gig Posts on the Map (Available Gigs Only) */}
            {gigs.filter(g => {
              const posterUser = allUsersList.find(u => u.uid === g.userId);
              const isTenantPost = g.userRole === 'Tenant' || g.isTenant || g.userEmail === 'timegig2026@gmail.com' || posterUser?.role === 'Tenant' || posterUser?.email === 'timegig2026@gmail.com';
              return !isTenantPost;
            }).map(gig => {
              if (!gig.location || !Array.isArray(gig.location) || gig.location.length < 2) return null;
              const isMyGig = gig.userId === user?.uid;
              const gigDesc = gig.description || '';
              let gadget = '🛠️';
              if (gigDesc.toLowerCase().includes('clean')) gadget = '🧹';
              else if (gigDesc.toLowerCase().includes('build') || gigDesc.toLowerCase().includes('construct')) gadget = '🏗️';
              else if (gigDesc.toLowerCase().includes('repair') || gigDesc.toLowerCase().includes('fix')) gadget = '🔧';
              else if (gigDesc.toLowerCase().includes('deliver')) gadget = '📦';
              
              return (
                <Marker 
                  key={gig.id} 
                  position={[gig.location[0], gig.location[1]]}
                  icon={L.divIcon({
                    className: 'bg-transparent',
                    html: `
                      <div class="relative w-11 h-11 rounded-2xl bg-white border-2 border-emerald-400 shadow-xl flex items-center justify-center hover:scale-110 transition-transform cursor-pointer">
                        <span class="text-xl">${gadget}</span>
                        <span class="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tight shadow">Gig</span>
                      </div>
                    `,
                    iconSize: [44, 44],
                    iconAnchor: [22, 22]
                  })}
                >
                  <Popup className="rounded-2xl shadow-xl">
                    <div className="p-3 space-y-2 text-left max-w-[240px]">
                      <div className="flex items-center justify-between gap-1 border-b border-gray-100 pb-1.5">
                        <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-100 text-emerald-800">💼 Available Gig</span>
                        {gig.budget && <span className="text-xs font-black text-emerald-600">R{gig.budget}</span>}
                      </div>
                      <div>
                        <h3 className="font-black text-sm text-black leading-snug">{gig.description}</h3>
                        {gig.contactNumber && (
                          <p className="text-[10px] text-gray-500 font-medium mt-1">
                            Contact: <span className="text-black font-bold">{gig.contactNumber}</span>
                          </p>
                        )}
                      </div>
                      <button 
                        onClick={() => setSelectedGigView(gig)}
                        className="w-full py-2 bg-black hover:bg-gray-900 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow"
                      >
                        {isMyGig ? 'Manage My Gig' : 'View Gig Details'}
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Real Seekers on the Live Map */}
            {seekersOnMap.map((seeker: any) => {
              const coords = getUserCoordinates(seeker);
              if (!coords) return null;
              return (
                <Marker 
                  key={`seeker-${seeker.uid}`} 
                  position={coords}
                  icon={L.divIcon({
                    className: 'bg-transparent',
                    html: `
                      <div class="relative w-11 h-11 rounded-full bg-white border-2 border-blue-600 shadow-xl flex items-center justify-center ring-2 ring-blue-400/40 hover:scale-110 transition-transform cursor-pointer">
                        <div class="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-gray-100 text-black">
                          ${seeker.photoURL ? `<img src="${seeker.photoURL}" class="w-full h-full object-cover" />` : `<span class="text-xs font-black">${(seeker.name || 'S')[0]}</span>`}
                        </div>
                        <span class="absolute -top-1 -right-1 text-sm bg-white rounded-full shadow-sm">
                          ${(seeker.workTrade || '').toLowerCase().includes('clean') ? '🧹' : 
                            (seeker.workTrade || '').toLowerCase().includes('build') || (seeker.workTrade || '').toLowerCase().includes('construct') ? '🏗️' :
                            (seeker.workTrade || '').toLowerCase().includes('repair') || (seeker.workTrade || '').toLowerCase().includes('fix') ? '🔧' :
                            (seeker.workTrade || '').toLowerCase().includes('deliver') ? '📦' :
                            (seeker.workTrade || '').toLowerCase().includes('electric') ? '⚡' :
                            (seeker.workTrade || '').toLowerCase().includes('plumb') ? '🚰' : '🛠️'}
                        </span>
                        <span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${seeker.isAvailableForWork !== false ? 'bg-emerald-500' : 'bg-gray-400'}" title="${seeker.isAvailableForWork !== false ? 'Available' : 'Busy'}"></span>
                      </div>
                    `,
                    iconSize: [44, 44],
                    iconAnchor: [22, 22]
                  })}
                >
                  <Popup className="rounded-2xl shadow-xl">
                    <div className="p-3 space-y-2 text-left max-w-[240px]">
                      <div className="flex items-center gap-2.5 border-b border-gray-100 pb-2">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                          {(seeker.photoURL && seeker.photoURL !== "") ? (
                            <img src={seeker.photoURL} alt={seeker.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-black text-gray-500">
                              {(seeker.name || 'S')[0]}
                            </div>
                          )}
                        </div>
                        <div className="truncate">
                          <h4 className="font-black text-black text-sm truncate flex items-center gap-1">
                            {seeker.name} {seeker.surname || ''}
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          </h4>
                          <span className="text-[9px] font-black uppercase bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full inline-block mt-0.5">
                            {seeker.workTrade || 'Job Seeker'}
                          </span>
                        </div>
                      </div>

                      {seeker.experience && (
                        <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed font-medium bg-gray-50 p-2 rounded-lg">
                          "{seeker.experience}"
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-400 font-bold uppercase">Status</span>
                        <span className={`font-black uppercase text-[9px] px-2 py-0.5 rounded-full ${seeker.isAvailableForWork !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                          {seeker.isAvailableForWork !== false ? 'Available for Work' : 'Busy'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        {seeker.contact ? (
                          <a
                            href={`https://wa.me/${seeker.contact.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 shadow-sm transition-all active:scale-95 text-center"
                          >
                            WhatsApp
                          </a>
                        ) : null}
                        <button
                          onClick={() => setOfferGigModalSeeker(seeker)}
                          className={`py-2 bg-black hover:bg-gray-900 text-white rounded-lg font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 shadow-sm transition-all active:scale-95 ${!seeker.contact ? 'col-span-2' : ''}`}
                        >
                          Hire Seeker
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {/* Activation View */}
        <div className={`absolute inset-0 bg-gray-50/80 backdrop-blur-xl z-20 transition-transform duration-300 flex flex-col p-4 pt-6 ${activeTab === 'activation' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
          <div className="max-w-md mx-auto w-full flex-1 flex flex-col gap-6 overflow-y-auto pb-10 no-scrollbar">
            {verificationStep === null ? (
              <>
                <div className="text-center py-4">
                  <h2 className="text-3xl font-black text-black tracking-tight">TimeGiG Pro</h2>
                  <p className="text-gray-500 text-sm font-medium mt-1">Unlock premium location features</p>
                  {isReferralUser && !isApproved && (
                    <div className="mt-3 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 border border-emerald-100">
                      <Sparkles className="w-3 h-3" /> 30-Day Free Trial Available
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 flex flex-col relative overflow-hidden group shrink-0">
                  <div className="aspect-[16/9] w-full overflow-hidden">
                    <img src="/src/assets/images/annual_subscription_hero_1793265786343.jpg" alt="Tenant Sub" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  </div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-emerald-600 text-[10px] font-black uppercase tracking-widest mb-1 block">Passive Income</span>
                        <h3 className="text-xl font-black text-black">Tenant Sub</h3>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-black">R399,00</div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Per Month</div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-6 font-medium">Build your verified network of job seekers and tenants while keeping your account active.</p>
                    <button onClick={() => startVerification('Tenant Sub')} className="w-full py-4 bg-black text-white font-bold rounded-2xl active:scale-95 transition-all text-sm">
                      {isReferralUser && !isApproved ? 'Start 30-Day Free Trial (Tenant)' : 'Activate Tenant Sub'}
                    </button>
                  </div>
                </div>
                <div className="bg-black rounded-[2rem] shadow-2xl flex flex-col relative overflow-hidden group shrink-0">
                  <div className="aspect-[16/9] w-full overflow-hidden opacity-80">
                    <img src="/src/assets/images/monthly_subscription_hero_1793265786780.jpg" alt="User Sub" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  </div>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1 block">Full Access</span>
                        <h3 className="text-xl font-black text-white">User Sub</h3>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-white">R29,99</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Per Month</div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400 mb-6 font-medium">Use all app features and keep your account active with a low monthly fee.</p>
                    <button onClick={() => startVerification('User Sub')} className="w-full py-4 bg-white text-black font-bold rounded-2xl active:scale-95 transition-all text-sm">
                      {isReferralUser && !isApproved ? 'Start 30-Day Free Trial (User)' : 'Activate User Sub'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col flex-1 h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button onClick={() => { stopCamera(); setVerificationStep(null); }} className="flex items-center gap-2 text-gray-500 font-bold uppercase tracking-widest text-[10px] mb-8 active:scale-95 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Back to Plans
                </button>
                <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-100 flex-1 flex flex-col">
                  {verificationStep === 'selfie' && (
                    <div className="flex-1 flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-blue-600">
                        <Camera className="w-8 h-8" />
                      </div>
                      <h3 className="text-xl font-black text-black mb-1">Selfie Verification</h3>
                      <p className="text-gray-500 text-xs mb-6 leading-relaxed">Position your face in the frame and capture a clear selfie.</p>
                      <div className="w-full flex-1 flex flex-col mb-6 overflow-hidden">
                        {(selfieImage && selfieImage !== "") ? (
                          <div className="relative flex-1 rounded-3xl overflow-hidden border-2 border-gray-100 shadow-sm animate-in fade-in zoom-in duration-300">
                            <img src={selfieImage} alt="Selfie preview" className="w-full h-full object-cover" />
                            <div className="absolute top-4 right-4">
                              <button onClick={() => setSelfieImage(null)} className="p-3 bg-black/60 backdrop-blur text-white rounded-full hover:bg-black transition-colors shadow-lg active:scale-90">
                                <RefreshCw className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={`relative flex-1 bg-black rounded-3xl overflow-hidden shadow-inner flex flex-col border-4 ${isCameraActive ? 'border-white/50' : 'border-gray-200 bg-gray-50'}`}>
                            <video ref={videoRef} autoPlay playsInline muted disablePictureInPicture className={`w-full h-full object-cover transition-opacity duration-500 ${isCameraActive ? 'opacity-100' : 'opacity-0'}`} style={{ transform: 'scaleX(-1)' }} />
                            {!isCameraActive && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gray-50">
                                {cameraError ? (
                                  <div className="space-y-4">
                                    <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                                      <X className="w-6 h-6" />
                                    </div>
                                    <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">{cameraError}</p>
                                    <button onClick={startCamera} className="py-4 px-8 bg-black text-white font-bold rounded-2xl shadow-xl active:scale-95 transition-all text-xs">Retry Camera</button>
                                  </div>
                                ) : isCameraLoading ? (
                                  <div className="space-y-4">
                                    <div className="w-12 h-12 border-3 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto" />
                                    <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Waking up camera...</p>
                                  </div>
                                ) : (
                                  <div className="space-y-6">
                                    <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto text-blue-600">
                                      <Camera className="w-10 h-10" />
                                    </div>
                                    <div className="space-y-4">
                                      <p className="text-gray-500 text-xs font-medium">Please enable your camera to take a selfie directly in the app.</p>
                                      <button onClick={startCamera} className="py-4 px-10 bg-blue-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-100 active:scale-95 transition-all text-xs">Start Camera</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {isCameraActive && (
                              <>
                                <div className="absolute inset-0 border-[30px] border-black/40 pointer-events-none transition-colors duration-300">
                                  <div className={`w-full h-full border-4 border-dashed rounded-[3rem] transition-colors duration-300 ${isFaceDetected ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/40'}`} />
                                </div>
                                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
                                  <div className={`px-4 py-2 rounded-full backdrop-blur-md flex items-center gap-2 transition-all duration-300 ${isFaceDetected ? 'bg-emerald-500 text-white scale-110 shadow-lg' : 'bg-black/40 text-white/80'}`}>
                                    {isFaceDetected ? <Check className="w-4 h-4" /> : <Scan className="w-4 h-4 animate-pulse" />}
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">{isFaceDetected ? 'Face Detected' : 'Detecting Face...'}</span>
                                  </div>
                                </div>
                                <button onClick={capturePhoto} className={`absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full border-4 flex items-center justify-center shadow-2xl active:scale-90 transition-all z-10 ${isFaceDetected ? 'bg-emerald-500 border-white/50' : 'bg-white border-white/30'}`}>
                                  <div className={`w-12 h-12 rounded-full border-2 ${isFaceDetected ? 'bg-emerald-400 border-white/20' : 'bg-white border-black/10'}`} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                      </div>
                      <div className="w-full flex flex-col gap-3">
                        <button onClick={() => { if (selfieImage) setVerificationStep('id'); }} disabled={!selfieImage} className={`w-full py-4 font-bold rounded-2xl active:scale-95 transition-all shadow-lg text-sm ${selfieImage ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>Continue to ID Upload</button>
                        {!isCameraActive && !selfieImage && (
                          <label className={`text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all mt-2 py-3 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 ${cameraError ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-400 hover:text-black'}`}>
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                            <Upload className="w-3 h-3" /> OR UPLOAD FACE-ONLY PICTURE
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                  {verificationStep === 'id' && (
                    <div className="flex-1 flex flex-col items-center text-center">
                      <div className="w-20 h-20 bg-purple-50 rounded-3xl flex items-center justify-center mb-6 text-purple-600">
                        <FileText className="w-10 h-10" />
                      </div>
                      <h3 className="text-2xl font-black text-black mb-2">ID Documents</h3>
                      <p className="text-gray-500 text-sm mb-10 leading-relaxed">Upload a clear photo of your ID or Passport to continue.</p>
                      <label className="w-full aspect-[4/3] bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center mb-10 group cursor-pointer hover:border-purple-400 transition-colors overflow-hidden">
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                              const compressed = await compressImage(reader.result as string);
                              setIdDocument(compressed);
                            };
                            reader.readAsDataURL(file);
                          }
                        }} />
                        {(idDocument && idDocument !== "") ? (
                          <img src={idDocument} className="w-full h-full object-cover" alt="ID Preview" />
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-gray-300 mb-2 group-hover:text-purple-400" />
                            <span className="text-xs font-bold text-gray-400 group-hover:text-purple-500 uppercase tracking-widest">Upload ID Card / Passport</span>
                          </>
                        )}
                      </label>
                      <button onClick={() => { if (idDocument) setVerificationStep('pop'); }} disabled={!idDocument} className={`w-full py-5 font-bold rounded-2xl active:scale-95 transition-all shadow-lg ${idDocument ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>Submit ID</button>
                    </div>
                  )}
                  {verificationStep === 'pop' && (
                    <div className="flex-1 flex flex-col items-center text-center">
                      <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mb-6 text-emerald-600">
                        {isReferralUser && !isApproved ? <Sparkles className="w-10 h-10" /> : <CreditCard className="w-10 h-10" />}
                      </div>
                      <h3 className="text-2xl font-black text-black mb-2">
                        {isReferralUser && !isApproved ? 'Claim Free Trial' : 'Proof of Payment'}
                      </h3>
                      <p className="text-gray-500 text-sm mb-10 leading-relaxed">
                        {isReferralUser && !isApproved 
                          ? `You are eligible for a 30-day free trial of ${selectedPlan}. No payment is required today. Click below to submit your trial request.`
                          : `Upload the proof of payment for your ${selectedPlan} activation.`}
                      </p>
                      
                      {!(isReferralUser && !isApproved) && (
                        <label className="w-full aspect-[16/9] bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center mb-10 group cursor-pointer hover:border-emerald-400 transition-colors overflow-hidden">
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = async () => {
                                const compressed = await compressImage(reader.result as string);
                                setPopDocument(compressed);
                              };
                              reader.readAsDataURL(file);
                            }
                          }} />
                          {(popDocument && popDocument !== "") ? (
                            <img src={popDocument} className="w-full h-full object-cover" alt="POP Preview" />
                          ) : (
                            <>
                              <Upload className="w-8 h-8 text-gray-300 mb-2 group-hover:text-emerald-400" />
                              <span className="text-xs font-bold text-gray-400 group-hover:text-emerald-500 uppercase tracking-widest">Upload Proof of Payment</span>
                            </>
                          )}
                        </label>
                      )}

                      <button 
                        onClick={async () => {
                          if ((popDocument || (isReferralUser && !isApproved)) && selfieImage && idDocument && user) {
                            try {
                              // Check referral limits
                              // Resolve final referrer
                              let finalReferrerId = profileData.referrerId || localStorage.getItem('timegig_ref') || '';
                              const referrerObj = allUsersList.find(u => u.uid === finalReferrerId);
                              const isAdminReferrer = referrerObj?.email?.toLowerCase() === 'timegig2026@gmail.com';
                              
                              // If referrer is a 'User' sub, the Main Tenant receives the submission
                              if (referrerObj && referrerObj.role === 'User' && !isAdminReferrer) {
                                const adminUser = allUsersList.find(u => u.email?.toLowerCase() === 'timegig2026@gmail.com');
                                if (adminUser) {
                                  finalReferrerId = adminUser.uid;
                                }
                              }

                              if (finalReferrerId) {
                                const q = query(collection(db, 'verifications'), where('referrerId', '==', finalReferrerId));
                                const snapshot = await getDocs(q);
                                const referralsList = snapshot.docs.map(d => d.data());
                                
                                const tenantReferrals = referralsList.filter(r => r.type === 'Tenant').length;
                                const userReferrals = referralsList.filter(r => r.type === 'User').length;
                                
                                const isTargetTenant = selectedPlan?.includes('Tenant');
                                const isFinalReferrerAdmin = allUsersList.find(u => u.uid === finalReferrerId)?.email?.toLowerCase() === 'timegig2026@gmail.com';

                                // Exempt main admin from limits
                                if (!isFinalReferrerAdmin) {
                                  if (isTargetTenant && tenantReferrals >= 10) {
                                    alert('Sorry, this referrer has reached the limit of 10 tenant referrals.');
                                    return;
                                  }
                                  if (!isTargetTenant && userReferrals >= 100) {
                                    alert('Sorry, this referrer has reached the limit of 100 user referrals.');
                                    return;
                                  }
                                }
                              }

                              const vRef = collection(db, 'verifications');
                              await addDoc(vRef, {
                                userId: user.uid,
                                referrerId: finalReferrerId,
                                userName: profileData.name && profileData.surname ? `${profileData.name} ${profileData.surname}` : (user.displayName || 'Applicant'),
                                type: selectedPlan?.includes('Tenant') ? 'Tenant' : 'User',
                                selfie: selfieImage,
                                idDoc: idDocument,
                                pop: popDocument,
                                status: 'pending',
                                plan: selectedPlan,
                                createdAt: serverTimestamp()
                              });

                              // Also sync referrerId in the users collection if it was reassigned
                              if (finalReferrerId !== (profileData.referrerId || localStorage.getItem('timegig_ref') || '')) {
                                await updateDoc(doc(db, 'users', user.uid), {
                                  referrerId: finalReferrerId
                                }).catch(() => null);
                              }
                              setVerificationStep('pending');
                            } catch (err) {
                              console.warn('Submission notice:', err);
                              setError('Failed to submit. Please try again.');
                            }
                          } else if (!user) {
                            setError('You must be logged in to submit.');
                            setActiveTab('auth');
                          }
                        }} 
                        disabled={!(popDocument || (isReferralUser && !isApproved))}
                        className={`w-full py-5 font-bold rounded-2xl active:scale-95 transition-all shadow-lg uppercase tracking-widest text-sm ${ (popDocument || (isReferralUser && !isApproved)) ? 'bg-emerald-600 text-white shadow-emerald-100' : 'bg-gray-100 text-gray-400'}`}
                      >
                        {isReferralUser && !isApproved ? 'Claim 30-Day Free Trial' : 'Submit Everything'}
                      </button>
                    </div>
                  )}
                  {verificationStep === 'pending' && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      <div className="w-24 h-24 bg-amber-50 rounded-full flex items-center justify-center mb-8 text-amber-600 relative">
                        <Clock className="w-12 h-12" />
                        <div className="absolute inset-0 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                      <h3 className="text-3xl font-black text-black mb-4 tracking-tight">Congratulations!</h3>
                      <p className="text-gray-500 text-sm mb-8 leading-relaxed font-medium">Your documents have been submitted successfully. Our team is currently reviewing your application.</p>
                      <div className="bg-amber-50 text-amber-800 font-bold py-3 px-6 rounded-full text-xs uppercase tracking-widest mb-10">Review takes about 15 to 25 minutes</div>
                      <button onClick={() => { setVerificationStep(null); setActiveTab(isApproved ? 'map' : 'profile'); }} className="w-full py-4 text-black font-bold border-2 border-black rounded-2xl active:scale-95 transition-all">{isApproved ? 'Go to Map' : 'Go to Profile'}</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tenant Dashboard View */}
        <div className={`absolute inset-0 bg-black/40 backdrop-blur-xl text-white z-30 transition-transform duration-300 flex flex-col overflow-hidden ${activeTab === 'tenant' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
          <div className="flex-1 flex flex-col p-6 pt-12 overflow-y-auto no-scrollbar">
            {!showReferralList ? (
              <div className="max-w-md mx-auto w-full space-y-4 pb-16">
                <div className="text-center mb-4 relative">
                  <h2 className="text-2xl font-black text-black tracking-tight mb-0.5">Tenant Dashboard</h2>
                  <p className="text-gray-500 text-[11px] font-medium">Verified Network Management</p>
                </div>

                {/* Referral Network Overview Box */}
                {(() => {
                  const refTenantsCount = referrals.filter(r => r.referrerId === user?.uid && r.type === 'Tenant').length;
                  const refUsersCount = referrals.filter(r => r.referrerId === user?.uid && r.type === 'User').length;
                  const totalNetworkCount = refTenantsCount + refUsersCount;
                  const tenantSubTotal = profileData.tenantSubProfit || (profileData.tenantProfit || 0);
                  const userSubTotal = profileData.userSubProfit || (profileData.userProfit || 0);
                  const totalProfitBalance = tenantSubTotal + userSubTotal;

                  const tenantTarget = isMainTenant ? (stats.tenantSignupTarget || 10) : 10;
                  const userSubTarget = isMainTenant ? (stats.userSubSignupTarget || 100) : 100;
                  const isTenantCapReached = !isMainTenant && refTenantsCount >= tenantTarget;
                  const isUserCapReached = !isMainTenant && refUsersCount >= userSubTarget;

                  return (
                    <div className="bg-black rounded-[1.5rem] p-5 shadow-xl relative overflow-hidden group border border-white/10 space-y-4">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <DollarSign className="w-16 h-16 text-emerald-400" />
                      </div>
                      
                      <div className="flex items-center justify-between relative z-10 border-b border-white/10 pb-3">
                        <div>
                          <span className="text-gray-400 text-[9px] font-black uppercase tracking-[0.2em] block">Total Profit Balance</span>
                          <div className="text-3xl font-black text-emerald-400 tracking-tighter">
                            R{totalProfitBalance}
                          </div>
                          <p className="text-[10px] text-gray-400 font-medium mt-0.5">Tenant Sub & User Sub Payments Received</p>
                        </div>
                        <div className="text-right">
                          <span className="text-gray-400 text-[9px] font-black uppercase tracking-wider block">Verified Network</span>
                          <div className="text-xl font-black text-white">{totalNetworkCount} Members</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 relative z-10">
                        <div className={`rounded-xl p-3 border text-left space-y-1 ${isTenantCapReached ? 'bg-red-500/20 border-red-500/50' : 'border-white/10 bg-white/5'}`}>
                          <span className="text-gray-400 text-[8px] font-black uppercase tracking-wider block">Tenant Sub Payments (Max 10)</span>
                          <div className="text-base font-black text-emerald-400">R{tenantSubTotal}</div>
                          <span className={`text-[9px] font-semibold block ${isTenantCapReached ? 'text-red-400 font-black' : 'text-gray-400'}`}>
                            {refTenantsCount} / {tenantTarget} Tenants {isTenantCapReached ? '(Cap Reached)' : ''}
                          </span>
                        </div>
                        <div className={`rounded-xl p-3 border text-left space-y-1 ${isUserCapReached ? 'bg-red-500/20 border-red-500/50' : 'border-white/10 bg-white/5'}`}>
                          <span className="text-gray-400 text-[8px] font-black uppercase tracking-wider block">User Sub Payments (Max 100)</span>
                          <div className="text-base font-black text-blue-400">R{userSubTotal}</div>
                          <span className={`text-[9px] font-semibold block ${isUserCapReached ? 'text-red-400 font-black' : 'text-gray-400'}`}>
                            {refUsersCount} / {userSubTarget} Users {isUserCapReached ? '(Cap Reached)' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Tenant Subscription Expiration Warning Alert */}
                {userRole === 'Tenant' && (
                  <TenantSubscriptionAlertBanner 
                    expiresAt={profileData.subscriptionExpiresAt} 
                    onRenew={handleRenewMyTenantSubscription} 
                  />
                )}

                {/* 24-Hour Compliance Notice for Regular Tenant */}
                {profileData.complianceWarningDeadline && !profileData.isTakenOver && !profileData.isFrozen && !isMainTenant && (
                  <div className="bg-gradient-to-r from-red-600 via-red-500 to-amber-600 text-white p-5 rounded-3xl shadow-xl border border-white/20 space-y-3 animate-pulse">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <span className="bg-black/30 text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full">
                          24-Hour Notice Active
                        </span>
                        <h3 className="text-base font-black uppercase tracking-wide mt-1">Get Account In Order</h3>
                        <p className="text-xs text-white/90 mt-1 leading-snug">
                          Main Administration (timegig2026@gmail.com) has issued a 24-hour compliance warning. You have unmanaged referral applications. Review them in Total Referrals now. Failure to manage your account within 24 hours will result in your account being frozen or taken over by Main Administration.
                        </p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                      <TenantComplianceNoticeCountdownPill deadline={profileData.complianceWarningDeadline} />
                      <button
                        onClick={() => setShowReferralList(true)}
                        className="bg-white text-black font-black text-xs px-4 py-2 rounded-xl shadow active:scale-95 transition-all"
                      >
                        Review Applications
                      </button>
                    </div>
                  </div>
                )}

                {/* Root Overseer Center - More Compact */}
                {isMainTenant && (
                  <div className="bg-white/90 backdrop-blur-xl rounded-xl p-3 shadow-sm border border-gray-100 space-y-3 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center shadow-md">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        <div>
                          <h3 className="font-black text-black text-xs flex items-center gap-1">
                            Overseer
                            <span className="text-[7px] font-bold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded-full uppercase">Admin</span>
                          </h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setShowOverseerCenter(!showOverseerCenter)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-black rounded-lg text-[8px] font-black uppercase tracking-wider transition-all"
                        >
                          {showOverseerCenter ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                        {delinquentTenants.length > 0 && (
                          <span className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase animate-pulse">
                            {delinquentTenants.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {showOverseerCenter && (
                      <div className="space-y-5 animate-in fade-in duration-200">

                    {delinquentTenants.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-left space-y-1">
                        <div className="flex items-center gap-1.5 text-red-600 font-black text-xs uppercase tracking-wider">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>Non-Managing Tenants Require Action</span>
                        </div>
                        <p className="text-[11px] text-red-700 leading-snug">
                          {delinquentTenants.length} tenant account{delinquentTenants.length === 1 ? ' has' : 's have'} neglected pending referral applications for over 24 hours or failed compliance deadlines. You have 24 hours enforcement authority: issue warnings, freeze accounts, or take over accounts so all subscription payments flow directly to you.
                        </p>
                      </div>
                    )}

                    {/* Main Tenant Signup Target & Subscription Fee Configuration Box */}
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-4 text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-black" />
                          <h4 className="font-black text-xs uppercase tracking-wider text-black">
                            Signup Targets & Subscription Fees
                          </h4>
                        </div>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                          Main Tenant Control
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Tenant Signup Target & Fee */}
                        <div className="bg-white p-3 rounded-xl border border-gray-100 space-y-2">
                          <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider block">
                            Tenant Signups Target
                          </span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              value={stats.tenantSignupTarget}
                              onChange={(e) => setStats(prev => ({ ...prev, tenantSignupTarget: Number(e.target.value) }))}
                              className="w-full bg-gray-50 p-2 rounded-lg text-xs font-black border border-gray-200 focus:border-black outline-none"
                            />
                            <span className="text-[10px] text-gray-400 font-bold">Goal</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[9px] font-bold text-gray-500">
                              <span>Active: {allTenants.length}</span>
                              <span>{Math.min(100, Math.round((allTenants.length / (stats.tenantSignupTarget || 1)) * 100))}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                                style={{ width: `${Math.min(100, (allTenants.length / (stats.tenantSignupTarget || 1)) * 100)}%` }} 
                              />
                            </div>
                          </div>
                          <div className="pt-1 border-t border-gray-100">
                            <label className="text-[8px] font-black text-gray-400 uppercase block mb-0.5">Tenant Sub Fee (R)</label>
                            <input
                              type="number"
                              value={stats.tenantSubFee}
                              onChange={(e) => setStats(prev => ({ ...prev, tenantSubFee: Number(e.target.value) }))}
                              className="w-full bg-gray-50 p-1.5 rounded-lg text-xs font-black text-emerald-600 border border-gray-200 focus:border-black outline-none"
                            />
                          </div>
                        </div>

                        {/* User Sub Signup Target & Fee */}
                        <div className="bg-white p-3 rounded-xl border border-gray-100 space-y-2">
                          <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider block">
                            User Sub Signups Target
                          </span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              value={stats.userSubSignupTarget}
                              onChange={(e) => setStats(prev => ({ ...prev, userSubSignupTarget: Number(e.target.value) }))}
                              className="w-full bg-gray-50 p-2 rounded-lg text-xs font-black border border-gray-200 focus:border-black outline-none"
                            />
                            <span className="text-[10px] text-gray-400 font-bold">Goal</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[9px] font-bold text-gray-500">
                              <span>Users: {allUsersList.length}</span>
                              <span>{Math.min(100, Math.round((allUsersList.length / (stats.userSubSignupTarget || 1)) * 100))}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 rounded-full transition-all duration-500" 
                                style={{ width: `${Math.min(100, (allUsersList.length / (stats.userSubSignupTarget || 1)) * 100)}%` }} 
                              />
                            </div>
                          </div>
                          <div className="pt-1 border-t border-gray-100">
                            <label className="text-[8px] font-black text-gray-400 uppercase block mb-0.5">User Sub Fee (R)</label>
                            <input
                              type="number"
                              value={stats.userSubFee}
                              onChange={(e) => setStats(prev => ({ ...prev, userSubFee: Number(e.target.value) }))}
                              className="w-full bg-gray-50 p-1.5 rounded-lg text-xs font-black text-blue-600 border border-gray-200 focus:border-black outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={async () => {
                          try {
                            await setDoc(doc(db, 'system', 'platform_stats'), {
                              tenantSignupTarget: stats.tenantSignupTarget,
                              userSubSignupTarget: stats.userSubSignupTarget,
                              tenantSubFee: stats.tenantSubFee,
                              userSubFee: stats.userSubFee,
                              updatedAt: serverTimestamp()
                            }, { merge: true });
                            playSmoothReceiveSound();
                            alert('✅ Platform signup targets and subscription fees updated successfully!');
                          } catch (e) {
                            console.warn('Update targets notice:', e);
                            setError('Failed to update signup targets.');
                          }
                        }}
                        className="w-full py-3 bg-black hover:bg-gray-900 text-white font-black text-xs rounded-xl uppercase tracking-wider shadow active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Save Signup Targets & Fees
                      </button>
                    </div>

                    {/* Quick Promotion Broadcast Action */}
                    <button
                      onClick={() => {
                        setMainTenantInboxTab('direct');
                        setShowInbox(true);
                      }}
                      className="w-full py-3.5 px-4 bg-black text-white rounded-2xl flex items-center justify-between border border-white/10 shadow-md active:scale-98 transition-all hover:border-amber-400/50 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-400 text-black flex items-center justify-center font-black shrink-0">
                          <Send className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <h4 className="text-xs font-black uppercase tracking-wider text-white group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
                            Type & Send Promotions
                            <span className="text-[9px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">Main Tenant Box</span>
                          </h4>
                          <p className="text-[10px] text-gray-400 font-medium">Broadcast messages to all tenants & users</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl bg-white/10 text-white group-hover:bg-amber-400 group-hover:text-black transition-all shrink-0">
                        Open Type Box →
                      </span>
                    </button>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-[10px] font-black uppercase tracking-wider">
                      <button 
                        onClick={() => setOverseerFilter('all')}
                        className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${overseerFilter === 'all' ? 'bg-black text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        All ({allTenants.length})
                      </button>
                      <button 
                        onClick={() => setOverseerFilter('delinquent')}
                        className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-1 ${overseerFilter === 'delinquent' ? 'bg-red-600 text-white shadow-md' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                      >
                        Delinquent ({delinquentTenants.length})
                      </button>
                      <button 
                        onClick={() => setOverseerFilter('warned')}
                        className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${overseerFilter === 'warned' ? 'bg-amber-600 text-white shadow-md' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}
                      >
                        24h Warning ({warnedTenants.length})
                      </button>
                      <button 
                        onClick={() => setOverseerFilter('frozen')}
                        className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${overseerFilter === 'frozen' ? 'bg-gray-800 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        Frozen ({frozenTenants.length})
                      </button>
                      <button 
                        onClick={() => setOverseerFilter('taken_over')}
                        className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${overseerFilter === 'taken_over' ? 'bg-blue-600 text-white shadow-md' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                      >
                        Taken Over ({takenOverTenants.length})
                      </button>
                    </div>

                    {/* DANGER ZONE: Wipe All Accounts */}
                    <div className="pt-4 border-t border-red-100 space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <ShieldAlert className="w-4 h-4 text-red-500" />
                        <h4 className="font-black text-[10px] uppercase tracking-widest text-red-500">System Danger Zone</h4>
                      </div>
                      <button
                        disabled={isWipingData}
                        onClick={handleWipeAllAccounts}
                        className={`w-full py-3 px-4 rounded-2xl border-2 border-red-100 flex items-center justify-between group transition-all active:scale-95 ${isWipingData ? 'bg-gray-50 opacity-50' : 'bg-red-50 hover:bg-red-600'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black transition-colors ${isWipingData ? 'bg-gray-200 text-gray-400' : 'bg-red-500 text-white group-hover:bg-white group-hover:text-red-600'}`}>
                            <Trash2 className="w-4 h-4" />
                          </div>
                          <div className="text-left">
                            <h5 className={`text-[11px] font-black uppercase tracking-wider transition-colors ${isWipingData ? 'text-gray-400' : 'text-red-600 group-hover:text-white'}`}>
                              {isWipingData ? 'Wiping System...' : 'Wipe All Registered Accounts'}
                            </h5>
                            <p className={`text-[9px] font-medium transition-colors ${isWipingData ? 'text-gray-400' : 'text-red-500 group-hover:text-red-100'}`}>
                              Irreversible: Deletes all users, verifications & messages
                            </p>
                          </div>
                        </div>
                        {!isWipingData && <AlertTriangle className="w-4 h-4 text-red-500 group-hover:text-white" />}
                      </button>
                    </div>

                    {/* Tenant Cards List */}
                    <div className="space-y-3 pt-1">
                      {filteredTenants.length === 0 ? (
                        <div className="p-6 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 space-y-3">
                          <p className="text-gray-400 font-bold uppercase tracking-wider text-[11px]">
                            {allTenants.length === 0 ? 'No external tenant accounts found' : 'No tenants in this filter'}
                          </p>
                          {allTenants.length === 0 && (
                            <button
                              onClick={seedDemoDelinquentTenant}
                              className="py-2.5 px-4 bg-black text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow active:scale-95 transition-all"
                            >
                              Seed Sample Delinquent Tenant (Test Alerts & Takeover)
                            </button>
                          )}
                        </div>
                      ) : (
                        filteredTenants.map((t) => {
                          const metrics = getTenantMetrics(t);
                          return (
                            <div key={t.uid} className={`p-4 rounded-2xl border transition-all space-y-3 ${
                              t.isTakenOver 
                                ? 'bg-blue-50/50 border-blue-200' 
                                : t.isFrozen 
                                ? 'bg-red-50/40 border-red-200' 
                                : metrics.isDelinquent 
                                ? 'bg-red-50/30 border-red-300 shadow-sm' 
                                : 'bg-gray-50/60 border-gray-100'
                            }`}>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h4 className="font-black text-black text-sm">{t.name || 'Tenant'} {t.surname || ''}</h4>
                                  <p className="text-[11px] text-gray-500 font-medium">{t.email}</p>
                                  {t.contact && <p className="text-[10px] text-gray-400 font-medium">{t.contact}</p>}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  {t.isTakenOver ? (
                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-blue-600 text-white flex items-center gap-1 shadow-sm">
                                      <Crown className="w-2.5 h-2.5" /> Taken Over
                                    </span>
                                  ) : t.isFrozen ? (
                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-red-600 text-white flex items-center gap-1 shadow-sm">
                                      <Lock className="w-2.5 h-2.5" /> Frozen
                                    </span>
                                  ) : metrics.isWarningActive ? (
                                    <TenantComplianceNoticeCountdownPill deadline={t.complianceWarningDeadline} />
                                  ) : metrics.isWarningExpired ? (
                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-red-600 text-white animate-pulse">
                                      24h Expired
                                    </span>
                                  ) : metrics.isDelinquent ? (
                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-red-500 text-white animate-pulse">
                                      Delinquent (&gt;24h)
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-100 text-emerald-700">
                                      Compliant
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Metrics row */}
                              <div className="grid grid-cols-4 gap-1 text-center bg-white p-1.5 rounded-lg border border-gray-100 text-[9px]">
                                <div>
                                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[8px]">Pending</span>
                                  <span className={`font-black ${metrics.pendingCount > 0 ? (metrics.oldestPendingHours >= 24 ? 'text-red-600' : 'text-amber-600') : 'text-gray-700'}`}>
                                    {metrics.pendingCount} {metrics.oldestPendingHours > 0 ? `(${metrics.oldestPendingHours}h)` : ''}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[8px]">Ref Tenants</span>
                                  <span className="font-black text-emerald-600">{referrals.filter(r => r.referrerId === t.uid && r.type === 'Tenant').length}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[8px]">Ref Users</span>
                                  <span className="font-black text-blue-600">{referrals.filter(r => r.referrerId === t.uid && r.type === 'User').length}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 font-bold uppercase tracking-wider block text-[8px]">Total Profit</span>
                                  <span className="font-black text-black">R{(t.tenantSubProfit ?? t.tenantProfit ?? 0) + (t.userSubProfit ?? t.userProfit ?? 0)}</span>
                                </div>
                              </div>

                              {/* Notice reason / Takeover summary */}
                              {t.isTakenOver ? (
                                <div className="p-2.5 bg-blue-100/60 rounded-xl text-[10px] text-blue-900 border border-blue-200">
                                  <p className="font-black flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3 text-blue-700" /> Account Managed by timegig2026@gmail.com
                                  </p>
                                  <p className="text-[9px] mt-0.5 text-blue-800">
                                    All subscription payments and referral applications route directly to Main Administration.
                                  </p>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  {/* Issue 24h warning */}
                                  {!metrics.isWarningActive ? (
                                    <button
                                      onClick={() => handleIssue24hWarning(t)}
                                      className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-1 shadow-sm"
                                    >
                                      <Clock className="w-3 h-3" /> Issue 24h Warning
                                    </button>
                                  ) : (
                                    <div className="flex-1 py-2 px-2.5 bg-amber-100 text-amber-900 rounded-xl font-bold text-[9px] flex items-center justify-center gap-1 border border-amber-200">
                                      <Clock className="w-3 h-3 text-amber-700" /> 24h Active
                                    </div>
                                  )}

                                  {/* Freeze / Unfreeze */}
                                  <button
                                    onClick={() => handleFreezeTenantAccount(t)}
                                    className={`py-2 px-3 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-1 border ${
                                      t.isFrozen 
                                        ? 'bg-emerald-500 text-white border-emerald-600' 
                                        : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                    }`}
                                  >
                                    {t.isFrozen ? (
                                      <><Unlock className="w-3 h-3" /> Unfreeze</>
                                    ) : (
                                      <><Lock className="w-3 h-3" /> Freeze</>
                                    )}
                                  </button>

                                  {/* Take Over Account */}
                                  <button
                                    onClick={() => handleTakeoverTenant(t)}
                                    className="w-full py-2.5 px-3 bg-black hover:bg-gray-900 text-white rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md border border-amber-400/40"
                                  >
                                    <Crown className="w-3.5 h-3.5 text-amber-400" /> Take Over Account & Routing
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

                {/* Referral Link Section */}
                <div className="bg-white rounded-[1.5rem] p-4 shadow-sm border border-gray-100 space-y-3">
                  <div>
                    <span className="text-gray-400 text-[9px] font-black uppercase tracking-widest mb-1 block">Your Referral Link</span>
                    <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <input 
                        readOnly 
                        value={`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`} 
                        className="flex-1 bg-transparent text-black text-xs outline-none font-medium"
                      />
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`);
                        }}
                        className="p-1.5 text-black hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Link2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button 
                      onClick={() => window.open(`https://wa.me/?text=Check out this app: ${encodeURIComponent(`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`)}`, '_blank')}
                      className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold text-xs"
                    >WhatsApp</button>
                    <button 
                      onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`)}`, '_blank')}
                      className="flex-1 py-3 bg-blue-400 text-white rounded-xl font-bold text-xs"
                    >Twitter</button>
                    <button 
                      onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`)}`, '_blank')}
                      className="flex-1 py-3 bg-blue-700 text-white rounded-xl font-bold text-xs"
                    >Facebook</button>
                  </div>
                </div>

              </div>
            ) : referralView ? (
              <div className="max-w-md mx-auto w-full flex-1 flex flex-col pb-20 animate-in fade-in slide-in-from-right-4 duration-300">
                <button onClick={() => setReferralView(null)} className="flex items-center gap-2 text-gray-500 font-bold uppercase tracking-widest text-[10px] mb-6 active:scale-95 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Back to List
                </button>
                <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-xl border border-gray-100">
                  <div className="p-8 border-b border-gray-50 flex items-center gap-6">
                    <div 
                      onClick={() => setFullScreenImage({ url: referralView.selfie, title: 'Applicant Selfie Photo', subtitle: referralView.name })}
                      className="relative group cursor-pointer shrink-0"
                      title="Click to view full screen"
                    >
                      {referralView.selfie && <img src={referralView.selfie} className="w-20 h-20 rounded-2xl object-cover shadow-lg border-2 border-white group-hover:scale-105 transition-transform" alt="Selfie" />}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center transition-opacity text-white">
                        <Maximize2 className="w-5 h-5" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-black mb-1">{referralView.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${referralView.type === 'Tenant' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>
                          {referralView.type} Application
                        </span>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">{referralView.date}</span>
                      </div>
                      <button 
                        onClick={() => setFullScreenImage({ url: referralView.selfie, title: 'Applicant Selfie Photo', subtitle: referralView.name })}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 mt-2 flex items-center gap-1 uppercase tracking-wider"
                      >
                        <Maximize2 className="w-3 h-3" /> Full Screen Selfie
                      </button>
                    </div>
                  </div>
                  <div className="p-8 space-y-8">
                    {/* Active Tenant Subscription Countdown Widget */}
                    {referralView.type === 'Tenant' && (referralView.status === 'active' || referralView.status === 'approved') && (
                      <ReferralCountdownWidget 
                        referral={referralView} 
                        onRenew={() => handleRenewReferralSubscription(referralView)} 
                      />
                    )}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><FileText className="w-3 h-3" /> ID / Passport Document</span>
                        <button 
                          onClick={() => setFullScreenImage({ url: referralView.idDoc, title: 'ID / Passport Document', subtitle: referralView.name })}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 uppercase tracking-wider"
                        >
                          <Maximize2 className="w-3 h-3" /> Full Screen
                        </button>
                      </div>
                      <div 
                        onClick={() => setFullScreenImage({ url: referralView.idDoc, title: 'ID / Passport Document', subtitle: referralView.name })}
                        className="aspect-[4/3] rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 cursor-pointer relative group shadow-sm hover:shadow-md transition-all"
                      >
                        {referralView.idDoc && <img src={referralView.idDoc} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" alt="ID Doc" />}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-xs">
                          <Maximize2 className="w-5 h-5" /> Click to View Full Screen
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><CreditCard className="w-3 h-3" /> Proof of Payment</span>
                        <button 
                          onClick={() => setFullScreenImage({ url: referralView.pop, title: 'Proof of Payment (POP)', subtitle: referralView.name })}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 uppercase tracking-wider"
                        >
                          <Maximize2 className="w-3 h-3" /> Full Screen
                        </button>
                      </div>
                      <div 
                        onClick={() => setFullScreenImage({ url: referralView.pop, title: 'Proof of Payment (POP)', subtitle: referralView.name })}
                        className="aspect-[16/9] rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 cursor-pointer relative group shadow-sm hover:shadow-md transition-all"
                      >
                        {referralView.pop && <img src={referralView.pop} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" alt="POP" />}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-xs">
                          <Maximize2 className="w-5 h-5" /> Click to View Full Screen
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={async () => { 
                            try {
                              await updateDoc(doc(db, 'verifications', referralView.id), { status: 'rejected' });
                              setReferralView(null);
                            } catch (err) { console.warn('Reject notice:', err); }
                          }} 
                          className="py-4 bg-red-50 text-red-600 font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-red-100 text-xs"
                        >
                          <Trash2 className="w-4 h-4" /> Reject
                        </button>
                        <button 
                          disabled={referralView.status === 'active' || referralView.status === 'approved'}
                          onClick={async () => { 
                            if (referralView.status === 'active' || referralView.status === 'approved') return;
                            try {
                              const vDoc = await getDoc(doc(db, 'verifications', referralView.id));
                              if (vDoc.exists()) {
                                const vData = vDoc.data();
                                const targetUserId = vData.userId;
                                const targetRole = vData.type || 'User';
                                const isTenant = targetRole === 'Tenant';
                                const subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                                
                                await updateDoc(doc(db, 'users', targetUserId), {
                                  isApproved: true,
                                  role: targetRole,
                                  photoURL: vData.selfie,
                                  subscriptionExpiresAt: subscriptionExpiresAt,
                                  subscriptionPlan: isTenant ? 'Tenant Sub' : 'User Sub'
                                });
                                
                                await updateDoc(doc(db, 'verifications', referralView.id), { 
                                  status: 'active',
                                  isViewed: true,
                                  activatedAt: serverTimestamp(),
                                  subscriptionExpiresAt: subscriptionExpiresAt
                                });
                                
                                const paymentAmount = isTenant ? (profileData.tenantSubFee || 100) : (profileData.userSubFee || 25);
                                const paymentLabel = isTenant ? 'Tenant Sub Payment' : 'User Sub Payment';

                                if (user) {
                                  const tenantDocRef = doc(db, 'users', user.uid);
                                  const tenantDoc = await getDoc(tenantDocRef);
                                  if (tenantDoc.exists()) {
                                    const tenantData = tenantDoc.data();
                                    const currentTenantSubProfit = tenantData.tenantSubProfit ?? tenantData.tenantProfit ?? 0;
                                    const currentUserSubProfit = tenantData.userSubProfit ?? tenantData.userProfit ?? 0;
                                    const currentTenantProfit = tenantData.tenantProfit ?? 0;
                                    const currentUserProfit = tenantData.userProfit ?? 0;

                                    const newTenantSubProfit = isTenant ? currentTenantSubProfit + paymentAmount : currentTenantSubProfit;
                                    const newUserSubProfit = !isTenant ? currentUserSubProfit + paymentAmount : currentUserSubProfit;
                                    const newTenantProfit = isTenant ? currentTenantProfit + paymentAmount : currentTenantProfit;
                                    const newUserProfit = !isTenant ? currentUserProfit + paymentAmount : currentUserProfit;

                                    await updateDoc(tenantDocRef, {
                                      tenantSubProfit: newTenantSubProfit,
                                      userSubProfit: newUserSubProfit,
                                      tenantProfit: newTenantProfit,
                                      userProfit: newUserProfit
                                    });

                                    setProfileData(prev => ({
                                      ...prev,
                                      tenantSubProfit: newTenantSubProfit,
                                      userSubProfit: newUserSubProfit,
                                      tenantProfit: newTenantProfit,
                                      userProfit: newUserProfit
                                    }));
                                  }
                                }

                                setTenantApprovalPopup({
                                  name: referralView.name,
                                  type: referralView.type,
                                  profitAmount: paymentAmount,
                                  profitLabel: paymentLabel
                                });
                              }
                              setReferralView(null);
                            } catch (err) { console.warn('Approve notice:', err); }
                          }} 
                          className={`py-4 font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg text-xs ${referralView.status === 'active' || referralView.status === 'approved' ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none' : 'bg-black text-white shadow-black/20'}`}
                        >
                          <Check className="w-4 h-4" /> {referralView.status === 'active' || referralView.status === 'approved' ? 'Already Active' : 'Approve'}
                        </button>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const newFrozenState = !referralView.isFrozen;
                            await updateDoc(doc(db, 'verifications', referralView.id), {
                              isFrozen: newFrozenState,
                              status: newFrozenState ? 'frozen' : 'active'
                            });
                            await updateDoc(doc(db, 'users', referralView.userId), {
                              isFrozen: newFrozenState,
                              isApproved: !newFrozenState
                            }).catch(e => console.warn(e));
                            setReferralView(prev => prev ? { ...prev, isFrozen: newFrozenState, status: newFrozenState ? 'frozen' : 'active' } : null);
                          } catch (err) {
                            console.warn('Freeze/unfreeze notice:', err);
                          }
                        }}
                        className={`w-full py-3.5 font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 text-xs border ${referralView.isFrozen ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}
                      >
                        <Lock className="w-4 h-4" /> {referralView.isFrozen ? 'Unfreeze Account' : 'Freeze Account'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto w-full flex-1 flex flex-col pb-20 animate-in fade-in slide-in-from-left-4 duration-300">
                <button onClick={() => setShowReferralList(false)} className="flex items-center gap-2 text-gray-500 font-bold uppercase tracking-widest text-[10px] mb-6 active:scale-95 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Back to Dashboard
                </button>
                <div className="space-y-4">
                  <h3 className="text-2xl font-black text-black mb-6">Total Referrals</h3>
                  {referrals.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-200">
                      <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No referral applications</p>
                    </div>
                  ) : referrals.map(ref => (
                    <button 
                      key={ref.id} 
                      onClick={async () => {
                        setReferralView(ref);
                        if (!ref.isViewed) {
                          try {
                            await updateDoc(doc(db, 'verifications', ref.id), { isViewed: true });
                          } catch (err) { console.warn('Mark viewed notice:', err); }
                        }
                      }} 
                      className={`w-full bg-white p-4 rounded-3xl border flex items-center gap-4 active:scale-[0.98] transition-all hover:border-blue-200 relative overflow-hidden ${!ref.isViewed ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'border-gray-100 shadow-sm'}`}
                    >
                      {!ref.isViewed && (
                        <div className="absolute top-0 right-0 w-8 h-8 bg-blue-500/10 rounded-bl-2xl flex items-center justify-center">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                        </div>
                      )}
                      {ref.selfie && <img src={ref.selfie} className="w-14 h-14 rounded-2xl object-cover shadow-md" alt="" />}
                      <div className="flex-1 text-left">
                        <h4 className="font-black text-black">{ref.name}</h4>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest ${ref.type === 'Tenant' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>{ref.type}</span>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest ${ref.status === 'active' || ref.status === 'approved' ? 'bg-emerald-600 text-white' : ref.status === 'frozen' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
                            {ref.status === 'active' || ref.status === 'approved' ? 'Active' : ref.status === 'frozen' ? 'Frozen' : 'Pending'}
                          </span>
                          {ref.type === 'Tenant' && (ref.status === 'active' || ref.status === 'approved') && (
                            <ReferralListTimerPill expiresAt={ref.subscriptionExpiresAt} />
                          )}
                        </div>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-gray-300 rotate-180" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Profile View */}
        <div className={`absolute inset-0 bg-black/40 backdrop-blur-xl text-white z-40 transition-transform duration-300 flex flex-col overflow-hidden ${activeTab === 'profile' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
          <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar pb-20">
            {/* Profile Header */}
            <div className="bg-black/80 backdrop-blur-2xl text-white p-8 pt-24 rounded-b-[3rem] relative overflow-visible border-b border-white/10">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Target className="w-32 h-32 rotate-12" />
              </div>
              <div className="relative z-10 flex flex-col items-center">
                {/* Top Corner Action Controls */}
                <div className="absolute -top-4 left-4 right-4 flex items-center justify-end gap-2 z-20">
                  <button 
                    onClick={() => { playSmoothClickSound(); setShowSettingsModal(true); }}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-95 flex items-center backdrop-blur-sm border border-white/10 shadow-lg"
                    title="Settings"
                  >
                    <Settings className="w-5 h-5 text-white" />
                  </button>

                  <button 
                    onClick={() => { playSmoothClickSound(); handleLogout(); }}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-95 flex items-center backdrop-blur-sm border border-white/10 shadow-lg"
                    title="Log Out"
                  >
                    <LogOut className="w-5 h-5 text-white" />
                  </button>
                </div>
                <div className="absolute -top-20 left-1/2 -translate-x-1/2 group">
                  <div className="w-32 h-32 bg-white rounded-full p-1.5 border-4 border-white/20 overflow-hidden shadow-2xl relative">
                    {selfieImage ? (
                      <img src={selfieImage} alt="Profile Logo" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-white/5 flex items-center justify-center text-white/40">
                        <User className="w-16 h-16" />
                      </div>
                    )}
                  </div>
                  {!profileLocked && (
                    <label className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full shadow-lg cursor-pointer active:scale-90 transition-all">
                      <Camera className="w-4 h-4" />
                      <input type="file" accept="image/*" className="hidden" onChange={updateProfileLogo} />
                    </label>
                  )}
                </div>
                <h2 className="text-2xl font-black mt-16 tracking-tight text-white">
                  {profileData.name || 'New'} {profileData.surname || 'User'}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${isApproved ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                    {isApproved ? 'Verified Account' : 'Pending Approval'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 max-w-md mx-auto w-full">
              {/* Referral Progress Section (For Tenants) */}
              {(userRole === 'Tenant' || isMainTenant) && (
                <div className="bg-blue-900/40 backdrop-blur-md p-6 rounded-[2rem] border border-blue-500/20 space-y-4">
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-400" />
                    <h3 className="text-white font-black uppercase tracking-widest text-xs">Referral Progress</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                      <p className="text-[10px] text-blue-300 font-bold uppercase">Referral Tenants</p>
                      <p className="text-2xl font-black text-white">{referrals.filter(r => r.referrerId === user?.uid && r.type === 'Tenant').length} <span className="text-xs text-blue-300 font-bold">/ {stats.tenantSignupTarget}</span></p>
                    </div>
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                      <p className="text-[10px] text-blue-300 font-bold uppercase">User Subscriptions</p>
                      <p className="text-2xl font-black text-white">{referrals.filter(r => r.referrerId === user?.uid && r.type === 'User').length} <span className="text-xs text-blue-300 font-bold">/ {stats.userSubSignupTarget}</span></p>
                    </div>
                  </div>
                </div>
              )}

              {/* Form Section */}
              <div className="bg-black/40 backdrop-blur-md p-8 rounded-[2rem] shadow-xl border border-white/10 space-y-6 text-white">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Name</label>
                    <input disabled={profileLocked} value={profileData.name} onChange={e => setProfileData({...profileData, name: e.target.value})} type="text" className="w-full bg-white text-black p-3 rounded-xl text-sm font-bold border border-gray-200 focus:ring-2 focus:ring-black transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Surname</label>
                    <input disabled={profileLocked} value={profileData.surname} onChange={e => setProfileData({...profileData, surname: e.target.value})} type="text" className="w-full bg-white text-black p-3 rounded-xl text-sm font-bold border border-gray-200 focus:ring-2 focus:ring-black transition-all" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2"><Phone className="w-3 h-3" /> Contact Information</label>
                  <input disabled={profileLocked} value={profileData.contact} onChange={e => setProfileData({...profileData, contact: e.target.value})} type="tel" className="w-full bg-white text-black p-3 rounded-xl text-sm font-bold border border-gray-200 focus:ring-2 focus:ring-black transition-all placeholder-gray-400" placeholder="+27 ..." />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2"><Mail className="w-3 h-3" /> Email Address</label>
                  <input disabled={profileLocked} value={profileData.email} onChange={e => setProfileData({...profileData, email: e.target.value})} type="email" className="w-full bg-white text-black p-3 rounded-xl text-sm font-bold border border-gray-200 focus:ring-2 focus:ring-black transition-all" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2"><MapPinned className="w-3 h-3" /> Home Location</label>
                  <div className="flex gap-2">
                    <input disabled={profileLocked} value={profileData.location} onChange={e => setProfileData({...profileData, location: e.target.value})} type="text" className="flex-1 bg-white text-black p-3 rounded-xl text-sm font-bold border border-gray-200 focus:ring-2 focus:ring-black transition-all" />
                    {!profileLocked && (
                      <button onClick={autofillLocation} className="p-3 bg-blue-600 text-white rounded-xl active:scale-95 transition-all"><Globe className="w-5 h-5" /></button>
                    )}
                  </div>
                </div>
              </div>

              {/* Trade & Experience */}
              <div className="bg-black/40 backdrop-blur-md p-8 rounded-[2rem] shadow-xl border border-white/10 space-y-6 text-white">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2"><Briefcase className="w-3 h-3" /> Primary Work Trade</label>
                  <select 
                    disabled={profileLocked} 
                    value={profileData.workTrade} 
                    onChange={e => setProfileData({...profileData, workTrade: e.target.value})}
                    className="w-full bg-white text-black p-3 rounded-xl text-sm font-bold border border-gray-200 focus:ring-2 focus:ring-black transition-all"
                  >
                    <option value="" className="bg-white text-black">Select a trade...</option>
                    {WORK_TRADES.map(t => <option key={t} value={t} className="bg-white text-black">{t}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2"><Star className="w-3 h-3" /> Work Experience</label>
                  <textarea disabled={profileLocked} value={profileData.experience} onChange={e => setProfileData({...profileData, experience: e.target.value})} className="w-full bg-white text-black p-3 rounded-xl text-sm font-bold border border-gray-200 focus:ring-2 focus:ring-black min-h-[100px] transition-all placeholder-gray-400" placeholder="Describe your experience..." />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2"><Users className="w-3 h-3" /> Work Reference</label>
                  <textarea disabled={profileLocked} value={profileData.reference} onChange={e => setProfileData({...profileData, reference: e.target.value})} className="w-full bg-white text-black p-3 rounded-xl text-sm font-bold border border-gray-200 focus:ring-2 focus:ring-black min-h-[80px] transition-all placeholder-gray-400" placeholder="Name and contact of reference..." />
                </div>
              </div>

              {/* Social Links */}
              <div className="bg-black/40 backdrop-blur-md p-8 rounded-[2rem] shadow-xl border border-white/10 space-y-6 text-white">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2"><Link2 className="w-3 h-3" /> Social Media Links</label>
                  {!profileLocked && (
                    <button onClick={addSocialLink} className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Add More</button>
                  )}
                </div>
                {profileData.socialLinks.map((link, i) => (
                  <input key={i} disabled={profileLocked} value={link} onChange={e => handleSocialLinkChange(i, e.target.value)} type="url" className="w-full bg-white text-black p-3 rounded-xl text-sm font-bold border border-gray-200 focus:ring-2 focus:ring-black transition-all mb-2 placeholder-gray-400" placeholder="https://..." />
                ))}
              </div>

              {/* Save/Edit Actions */}
              <div className="pt-4">
                {profileLocked ? (
                  <button onClick={() => setProfileLocked(false)} className="w-full py-5 bg-black text-white font-black rounded-2xl shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                    <Unlock className="w-5 h-5" /> EDIT PROFILE
                  </button>
                ) : (
                  <button 
                    onClick={async () => {
                      if (!profileData.name || !profileData.surname || !profileData.contact || !profileData.email || !profileData.workTrade || !profileData.experience || !profileData.reference) {
                        setError('Please fill all required fields, including at least one work experience and reference.');
                        return;
                      }
                      if (user) {
                        try {
                          await updateDoc(doc(db, 'users', user.uid), {
                            ...profileData,
                            profileLocked: true
                          });
                          setProfileLocked(true);
                        } catch (err) { console.warn('Profile save notice:', err); }
                      } else {
                        setError('Log in to save your profile.');
                        setActiveTab('auth');
                      }
                    }} 
                    className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all"
                  >
                    <Lock className="w-5 h-5" /> SAVE & LOCK PROFILE
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Total Referrals View (Bottom Menu Feature) */}
        <div className={`absolute inset-0 bg-black/40 backdrop-blur-xl text-white z-35 transition-transform duration-300 flex flex-col overflow-hidden ${activeTab === 'referrals' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
          <div className="flex-1 flex flex-col p-6 pt-12 overflow-y-auto no-scrollbar">
            {referralView ? (
              <div className="max-w-md mx-auto w-full flex-1 flex flex-col pb-20 animate-in fade-in slide-in-from-right-4 duration-300">
                <button onClick={() => setReferralView(null)} className="flex items-center gap-2 text-white/90 hover:text-white font-bold uppercase tracking-widest text-[10px] mb-6 active:scale-95 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Back to Referral List
                </button>
                <div className="bg-white rounded-[2.5rem] p-6 shadow-2xl border border-gray-100 space-y-6 text-black">
                  <div className="flex items-center gap-4 border-b border-gray-100 pb-6">
                    {referralView.selfie && <img src={referralView.selfie} className="w-20 h-20 rounded-3xl object-cover shadow-md border border-gray-200" alt="" />}
                    <div>
                      <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest mb-1 inline-block ${referralView.type === 'Tenant' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>{referralView.type}</span>
                      <h3 className="text-xl font-black text-black">{referralView.name}</h3>
                      <p className="text-xs text-gray-500 font-bold">{referralView.date}</p>
                    </div>
                  </div>

                  {referralView.type === 'Tenant' && (referralView.status === 'active' || referralView.status === 'approved') && (
                    <ReferralCountdownWidget referral={referralView} />
                  )}

                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><FileText className="w-3 h-3" /> ID / Passport Document</span>
                        <button onClick={() => setFullScreenImage({ url: referralView.idDoc, title: 'ID / Passport Document', subtitle: referralView.name })} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 uppercase tracking-wider">
                          <Maximize2 className="w-3 h-3" /> Full Screen
                        </button>
                      </div>
                      <div onClick={() => setFullScreenImage({ url: referralView.idDoc, title: 'ID / Passport Document', subtitle: referralView.name })} className="aspect-[4/3] rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 cursor-pointer relative group shadow-sm hover:shadow-md transition-all">
                        {referralView.idDoc && <img src={referralView.idDoc} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" alt="ID Doc" />}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><CreditCard className="w-3 h-3" /> Proof of Payment</span>
                        <button onClick={() => setFullScreenImage({ url: referralView.pop, title: 'Proof of Payment (POP)', subtitle: referralView.name })} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 uppercase tracking-wider">
                          <Maximize2 className="w-3 h-3" /> Full Screen
                        </button>
                      </div>
                      <div onClick={() => setFullScreenImage({ url: referralView.pop, title: 'Proof of Payment (POP)', subtitle: referralView.name })} className="aspect-[16/9] rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 cursor-pointer relative group shadow-sm hover:shadow-md transition-all">
                        {referralView.pop && <img src={referralView.pop} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" alt="POP" />}
                      </div>
                    </div>
                    <div className="space-y-4 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <button onClick={async () => { try { await updateDoc(doc(db, 'verifications', referralView.id), { status: 'rejected' }); setReferralView(null); } catch (err) { console.warn(err); } }} className="py-4 bg-red-50 text-red-600 font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-red-100 text-xs">
                          <Trash2 className="w-4 h-4" /> Reject
                        </button>
                        <button disabled={referralView.status === 'active' || referralView.status === 'approved'} onClick={async () => {
                          if (referralView.status === 'active' || referralView.status === 'approved') return;
                          try {
                            const vDoc = await getDoc(doc(db, 'verifications', referralView.id));
                            if (vDoc.exists()) {
                              const vData = vDoc.data();
                              const targetUserId = vData.userId;
                              const targetRole = vData.type || 'User';
                              const isTenant = targetRole === 'Tenant';
                              const subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                              await updateDoc(doc(db, 'users', targetUserId), {
                                isApproved: true,
                                role: targetRole,
                                photoURL: vData.selfie,
                                subscriptionExpiresAt: subscriptionExpiresAt,
                                subscriptionPlan: isTenant ? 'Tenant Sub' : 'User Sub'
                              });
                              await updateDoc(doc(db, 'verifications', referralView.id), { 
                                status: 'active',
                                isViewed: true,
                                activatedAt: serverTimestamp(),
                                subscriptionExpiresAt: subscriptionExpiresAt
                              });
                              const paymentAmount = isTenant ? (profileData.tenantSubFee || 100) : (profileData.userSubFee || 25);
                              const paymentLabel = isTenant ? 'Tenant Sub Payment' : 'User Sub Payment';
                              if (user) {
                                const tenantDocRef = doc(db, 'users', user.uid);
                                const tenantDoc = await getDoc(tenantDocRef);
                                if (tenantDoc.exists()) {
                                  const tenantData = tenantDoc.data();
                                  const currentTenantSubProfit = tenantData.tenantSubProfit ?? tenantData.tenantProfit ?? 0;
                                  const currentUserSubProfit = tenantData.userSubProfit ?? tenantData.userProfit ?? 0;
                                  const currentTenantProfit = tenantData.tenantProfit ?? 0;
                                  const currentUserProfit = tenantData.userProfit ?? 0;
                                  await updateDoc(tenantDocRef, {
                                    tenantSubProfit: isTenant ? currentTenantSubProfit + paymentAmount : currentTenantSubProfit,
                                    userSubProfit: !isTenant ? currentUserSubProfit + paymentAmount : currentUserSubProfit,
                                    tenantProfit: isTenant ? currentTenantProfit + paymentAmount : currentTenantProfit,
                                    userProfit: !isTenant ? currentUserProfit + paymentAmount : currentUserProfit
                                  });
                                }
                              }
                              setTenantApprovalPopup({ name: referralView.name, type: referralView.type, profitAmount: paymentAmount, profitLabel: paymentLabel });
                            }
                            setReferralView(null);
                          } catch (err) { console.warn(err); }
                        }} className={`py-4 font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg text-xs ${referralView.status === 'active' || referralView.status === 'approved' ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-black text-white shadow-black/20'}`}>
                          <Check className="w-4 h-4" /> {referralView.status === 'active' || referralView.status === 'approved' ? 'Already Active' : 'Approve'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto w-full flex-1 flex flex-col pb-20 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="text-center relative mb-6">
                  <h2 className="text-3xl font-black text-white tracking-tight mb-1">Total Referrals</h2>
                  <p className="text-gray-300 text-xs font-medium">Review Referral Applications & Subscriptions</p>
                </div>

                {/* Referral Link Copy & Share */}
                <div className="bg-white rounded-[2rem] p-5 shadow-xl border border-gray-100 space-y-3 mb-6 text-black">
                  <span className="text-gray-500 text-[10px] font-black uppercase tracking-widest block">Your Referral Link</span>
                  <div className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                    <input 
                      readOnly 
                      value={`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`} 
                      className="flex-1 bg-transparent text-black text-xs font-mono outline-none"
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`);
                        playSmoothReceiveSound();
                        alert('✅ Referral link copied!');
                      }}
                      className="p-2 bg-black text-white rounded-lg transition-all active:scale-90"
                    >
                      <Link2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button 
                      onClick={() => window.open(`https://wa.me/?text=Join TimeGiG using my referral link: ${encodeURIComponent(`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`)}`, '_blank')}
                      className="flex-1 py-2 bg-emerald-500 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider"
                    >WhatsApp</button>
                    <button 
                      onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`)}`, '_blank')}
                      className="flex-1 py-2 bg-blue-500 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider"
                    >Twitter</button>
                    <button 
                      onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`)}`, '_blank')}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider"
                    >Facebook</button>
                  </div>
                </div>

                {/* Referrals List */}
                <div className="space-y-3">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Applications ({referrals.length})
                  </h3>
                  {referrals.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-[2rem] border border-dashed border-gray-200 space-y-2 text-black shadow-xl">
                      <Users className="w-8 h-8 text-gray-400 mx-auto" />
                      <p className="text-gray-700 font-bold uppercase tracking-widest text-xs">No referral applications found</p>
                      <p className="text-gray-500 text-[11px]">Share your link above to invite tenant & user signups to your verified network!</p>
                    </div>
                  ) : referrals.map(ref => (
                    <button 
                      key={ref.id} 
                      onClick={async () => {
                        setReferralView(ref);
                        if (!ref.isViewed) {
                          try {
                            await updateDoc(doc(db, 'verifications', ref.id), { isViewed: true });
                          } catch (err) { console.warn(err); }
                        }
                      }} 
                      className={`w-full bg-white p-4 rounded-3xl border flex items-center gap-4 active:scale-[0.98] transition-all hover:border-gray-300 relative overflow-hidden text-black ${!ref.isViewed ? 'border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]' : 'border-gray-100 shadow-xl'}`}
                    >
                      {!ref.isViewed && (
                        <div className="absolute top-0 right-0 w-8 h-8 bg-amber-500/20 rounded-bl-2xl flex items-center justify-center">
                          <div className="w-2 h-2 bg-amber-400 rounded-full animate-ping" />
                        </div>
                      )}
                      {ref.selfie && <img src={ref.selfie} className="w-14 h-14 rounded-2xl object-cover shadow-md border border-gray-200" alt="" />}
                      <div className="flex-1 text-left">
                        <h4 className="font-black text-black">{ref.name}</h4>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest ${ref.type === 'Tenant' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>{ref.type}</span>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest ${ref.status === 'active' || ref.status === 'approved' ? 'bg-emerald-600 text-white' : ref.status === 'frozen' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
                            {ref.status === 'active' || ref.status === 'approved' ? 'Active' : ref.status === 'frozen' ? 'Frozen' : 'Pending'}
                          </span>
                          {ref.type === 'Tenant' && (ref.status === 'active' || ref.status === 'approved') && (
                            <ReferralListTimerPill expiresAt={ref.subscriptionExpiresAt} />
                          )}
                        </div>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-gray-400 rotate-180" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Seekers Directory View (Bottom Menu Feature) */}
        <div className={`absolute inset-0 bg-black/40 backdrop-blur-xl text-white z-35 transition-transform duration-300 flex flex-col overflow-hidden ${activeTab === 'seekers' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
          {/* Fixed Header & Search Section (Compact) */}
          <div className="bg-black/50 backdrop-blur-2xl p-4 pt-10 border-b border-white/10 shadow-lg space-y-3 z-20 shrink-0">
            <div className="max-w-md mx-auto w-full space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">Gig Seekers</h2>
                  <p className="text-gray-400 text-[10px] font-medium uppercase tracking-wider">Local Pros</p>
                </div>
                {/* Compact Availability Indicator */}
                <div className="flex items-center gap-2 bg-black/60 text-white px-3 py-1.5 rounded-xl shadow-sm border border-white/10">
                  <div className={`w-2 h-2 rounded-full ${currentUserAvailability ? 'bg-emerald-400 animate-ping' : 'bg-gray-400'}`} />
                  <span className="text-[9px] font-black uppercase tracking-tight">
                    {currentUserAvailability ? 'Available' : 'Busy'}
                  </span>
                  <button
                    onClick={handleToggleMyAvailability}
                    className="ml-1 p-1 bg-white/10 hover:bg-white/20 rounded-lg transition-all active:scale-90"
                    title="Toggle Availability"
                  >
                    <RefreshCw className="w-3 h-3 text-white" />
                  </button>
                </div>
              </div>

              {/* Search Bar & Category Filters (Compact) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-black/20 transition-all">
                  <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search name, trade, location..."
                    value={seekerSearchQuery}
                    onChange={(e) => setSeekerSearchQuery(e.target.value)}
                    className="w-full bg-transparent text-[11px] font-bold text-black placeholder-gray-400 outline-none"
                  />
                  {seekerSearchQuery && (
                    <button onClick={() => setSeekerSearchQuery('')} className="p-1 text-gray-400 hover:text-black">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5 text-[9px] font-black uppercase tracking-wider">
                  <button
                    onClick={() => setSeekerTradeFilter('All')}
                    className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${seekerTradeFilter === 'All' ? 'bg-black text-white shadow-md' : 'bg-white text-gray-800 border border-gray-200 hover:bg-gray-100'}`}
                  >
                    All ({allUsersList.filter(u => !user || u.uid !== user.uid).length})
                  </button>
                  {WORK_TRADES.slice(0, 10).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSeekerTradeFilter(t)}
                      className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${seekerTradeFilter === t ? 'bg-black text-white shadow-md' : 'bg-white text-gray-800 border border-gray-200 hover:bg-gray-100'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-4">
            <div className="max-w-md mx-auto w-full space-y-3 pb-24">

              {/* Empty state */}
              {filteredSeekers.length === 0 && (
                <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-gray-200 space-y-2 text-black shadow-xl">
                  <Users className="w-8 h-8 text-gray-400 mx-auto" />
                  <p className="text-gray-900 font-bold text-sm">No registered seekers found</p>
                  <p className="text-gray-500 font-medium text-xs">As new verified job seekers register and set their trade or availability, they will appear here live.</p>
                </div>
              )}

              {/* Seekers Cards Grid */}
              <div className="space-y-4">
                {filteredSeekers.map((s: any) => (
                  <div key={s.uid} className="bg-white rounded-[2rem] p-5 border border-gray-100 shadow-xl space-y-4 text-black hover:shadow-2xl hover:border-gray-200 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-14 h-14 rounded-2xl bg-gray-100 overflow-hidden border border-gray-200 shadow-inner">
                            {(s.photoURL && s.photoURL !== "") ? (
                              <img src={s.photoURL} alt={s.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 font-black text-lg bg-gray-100">
                                {(s.name || 'S')[0]}
                              </div>
                            )}
                          </div>
                          <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${s.isAvailableForWork !== false ? 'bg-emerald-500' : 'bg-gray-400'}`} title={s.isAvailableForWork !== false ? 'Available' : 'Busy'} />
                        </div>
                        <div>
                          <h4 className="font-black text-black text-base flex items-center gap-1.5">
                            {s.name || 'Seeker'} {s.surname || ''}
                            <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />
                          </h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase bg-blue-50 text-blue-700 border border-blue-100">
                              {s.workTrade || 'General Seeker'}
                            </span>
                            <span className="text-[9px] font-bold text-gray-500 flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 text-gray-400" /> {s.location || 'Local'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${s.isAvailableForWork !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                        {s.isAvailableForWork !== false ? 'Available' : 'Busy'}
                      </span>
                    </div>

                    {s.experience && (
                      <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100 leading-relaxed font-medium">
                        "{s.experience}"
                      </p>
                    )}

                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-100">
                      {s.contact ? (
                        <button
                          onClick={() => window.open(`https://wa.me/${s.contact.replace(/[^0-9]/g, '')}`, '_blank')}
                          className="py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-95"
                        >
                          WhatsApp
                        </button>
                      ) : (
                        <button disabled className="py-2.5 bg-gray-50 text-gray-300 rounded-xl font-bold text-[10px] uppercase cursor-not-allowed">
                          WhatsApp
                        </button>
                      )}

                      {s.contact ? (
                        <button
                          onClick={() => window.open(`tel:${s.contact}`, '_self')}
                          className="py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-95"
                        >
                          Call
                        </button>
                      ) : (
                        <button disabled className="py-2.5 bg-gray-50 text-gray-300 rounded-xl font-bold text-[10px] uppercase cursor-not-allowed">
                          Call
                        </button>
                      )}

                      <button
                        onClick={() => setOfferGigModalSeeker(s)}
                        className="py-2.5 bg-black hover:bg-gray-900 text-white rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm"
                      >
                        Offer Gig
                      </button>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>

        {/* Offer Gig Modal */}
        {offerGigModalSeeker && (
          <div className="fixed inset-0 z-[10500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-[2.5rem] p-6 max-w-sm w-full space-y-4 shadow-2xl border border-gray-100">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-600" />
                  <h3 className="font-black text-black text-base">Hire Seeker: {offerGigModalSeeker.name}</h3>
                </div>
                <button onClick={() => setOfferGigModalSeeker(null)} className="p-1 text-gray-400 hover:text-black">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-gray-500 font-medium">
                Send a direct hiring invitation message to <span className="font-bold text-black">{offerGigModalSeeker.name} {offerGigModalSeeker.surname || ''}</span> ({offerGigModalSeeker.workTrade || 'Seeker'}).
              </p>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Gig Offer Title / Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Plumbing Repair at Sandton Office..."
                  value={offerGigTitle}
                  onChange={(e) => setOfferGigTitle(e.target.value)}
                  className="w-full bg-gray-50 p-3 rounded-xl text-xs font-bold text-black border border-gray-200 outline-none focus:border-black"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Offer Details & Payment Rate</label>
                <textarea
                  rows={3}
                  placeholder="Describe job scope, payment rate (R), location and start time..."
                  value={offerGigDetails}
                  onChange={(e) => setOfferGigDetails(e.target.value)}
                  className="w-full bg-gray-50 p-3 rounded-xl text-xs font-bold text-black border border-gray-200 outline-none focus:border-black"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setOfferGigModalSeeker(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!offerGigTitle || !offerGigDetails) {
                      alert('Please enter gig title and details.');
                      return;
                    }
                    try {
                      await addDoc(collection(db, 'promotions'), {
                        senderUid: user?.uid || 'system',
                        senderName: profileData.name ? `${profileData.name} ${profileData.surname}` : 'Gig Owner',
                        senderEmail: user?.email || '',
                        recipientUid: offerGigModalSeeker.uid,
                        recipientName: offerGigModalSeeker.name,
                        targetType: 'selected',
                        subject: `GIG OFFER: ${offerGigTitle}`,
                        body: offerGigDetails,
                        createdAt: serverTimestamp(),
                        isRead: false
                      });
                      playSmoothReceiveSound();
                      alert(`✅ Hiring request sent successfully to ${offerGigModalSeeker.name}!`);
                      setOfferGigModalSeeker(null);
                      setOfferGigTitle('');
                      setOfferGigDetails('');
                    } catch (err) {
                      console.warn('Offer gig error:', err);
                      alert('Failed to send gig offer.');
                    }
                  }}
                  className="flex-1 py-3 bg-black text-white rounded-xl font-black text-xs uppercase tracking-wider shadow active:scale-95"
                >
                  Send Offer
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Auth View */}
      <div className={`absolute inset-0 bg-white z-[50] transition-transform duration-300 flex flex-col items-center justify-center p-8 ${activeTab === 'auth' ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="w-full max-w-sm flex flex-col items-center text-center space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl font-black text-black tracking-tight">TimeGiG</h1>
              <p className="text-gray-500 font-medium">Verify your identity and find local gigs in real-time.</p>
            </div>

            {user ? (
              <div className="w-full space-y-6">
                <div className="bg-gray-50 p-6 rounded-[2.5rem] border border-gray-100 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-black flex items-center justify-center">
                    {(user.photoURL && user.photoURL !== "") ? (
                      <img src={user.photoURL} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <User className="w-6 h-6 text-white/40" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Logged in as</p>
                    <h3 className="font-black text-black">{user.displayName || user.email}</h3>
                  </div>
                </div>
                <button onClick={handleLogout} className="w-full py-5 bg-black text-white font-black rounded-2xl shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                  <LogOut className="w-5 h-5" /> SIGN OUT
                </button>
              </div>
            ) : (
              <div className="w-full space-y-4">
                {authError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-bold text-left">
                    {authError}
                  </div>
                )}
                <button onClick={handleLogin} className="w-full py-4 bg-black text-white font-black rounded-2xl shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                  <LogIn className="w-5 h-5" /> SIGN IN WITH GOOGLE
                </button>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">Or Sign In with Email</p>
                  <form onSubmit={handleEmailAuth} className="space-y-2">
                    <input 
                      type="email" 
                      placeholder="Email address..." 
                      value={authEmail} 
                      onChange={e => setAuthEmail(e.target.value)}
                      className="w-full bg-gray-50 p-3 rounded-xl text-xs font-bold text-black border border-gray-200 focus:ring-2 focus:ring-black outline-none" 
                    />
                    <input 
                      type="password" 
                      placeholder="Password..." 
                      value={authPassword} 
                      onChange={e => setAuthPassword(e.target.value)}
                      className="w-full bg-gray-50 p-3 rounded-xl text-xs font-bold text-black border border-gray-200 focus:ring-2 focus:ring-black outline-none" 
                    />
                    <button 
                      type="submit" 
                      disabled={isAuthSubmitting}
                      className="w-full py-3.5 bg-gray-900 text-white font-bold rounded-xl text-xs uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isAuthSubmitting ? 'Signing In...' : 'Sign In / Register'}
                    </button>
                  </form>
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] text-center">Secure authentication via Firebase</p>
              </div>
            )}
          </div>
        </div>

      {/* Bottom Menu Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-100 flex items-center justify-around px-4 z-[9999] pb-[env(safe-area-inset-bottom)] shadow-lg shrink-0">
        {!user ? (
          <div className="flex items-center justify-around w-full max-w-sm mx-auto">
            <button onClick={() => { setVerificationStep(null); setActiveTab('auth'); }} className="flex flex-col items-center gap-0.5 text-black transition-all active:scale-90">
              <LogIn className="w-6 h-6 text-black stroke-[2]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-black">{isReferralFlow ? 'Register' : 'Sign-In'}</span>
            </button>
            {!isReferralRegistering && !isReferralFlow && (
              <button 
                onClick={() => { setActiveTab('map'); setVerificationStep(null); }} 
                className="flex flex-col items-center gap-0.5 text-black transition-all active:scale-90"
                title="View GiGs Map"
              >
                <LocateFixed className="w-8 h-8 text-black stroke-[2]" />
                <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-black">GiGs</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* 1. Tenant Dashboard (For Tenants / Main Admin) */}
            {(userRole === 'Tenant' || isMainTenant) && (
              <button 
                onClick={() => { playSmoothClickSound(); setVerificationStep(null); setActiveTab(activeTab === 'tenant' ? 'map' : 'tenant'); setShowReferralList(false); setReferralView(null); }} 
                className={`flex flex-col items-center gap-0.5 transition-all active:scale-90 relative ${activeTab === 'tenant' ? 'text-black font-black' : 'text-gray-500 hover:text-black'}`}
              >
                <LayoutGrid className="w-5 h-5 stroke-[2]" />
                {(activeTab !== 'tenant' || userRole === 'User') && <span className="text-[9px] font-bold uppercase tracking-[0.1em]">Tenant</span>}
                {isMainTenant && delinquentTenants.length > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full animate-pulse shadow-sm">
                    {delinquentTenants.length}
                  </span>
                )}
              </button>
            )}

            {/* 2. Total Refs Feature */}
            <button 
              onClick={() => { playSmoothClickSound(); setVerificationStep(null); setActiveTab(activeTab === 'referrals' ? 'map' : 'referrals'); setShowReferralList(true); setReferralView(null); }} 
              className={`flex flex-col items-center gap-0.5 transition-all active:scale-90 relative ${activeTab === 'referrals' ? 'text-black font-black' : 'text-gray-500 hover:text-black'}`}
              title="Total Refs"
            >
              <Users className="w-5 h-5 stroke-[2]" />
              {(activeTab !== 'referrals' || userRole === 'User') && <span className="text-[9px] font-bold uppercase tracking-[0.1em]">Refs</span>}
              {(() => {
                const pendingCount = referrals.filter(r => r.status === 'pending').length;
                if (pendingCount > 0) {
                  return (
                    <span className="absolute -top-1.5 -right-2 bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full animate-pulse shadow-sm">
                      {pendingCount}
                    </span>
                  );
                }
                return null;
              })()}
            </button>

            {/* 3. GiGs Map Icon (Centered & Bigger) */}
            {showGigsIconForUser && (
              <button 
                onClick={() => { playSmoothClickSound(); setActiveTab(activeTab === 'map' ? 'map' : 'map'); setVerificationStep(null); }} 
                className={`flex flex-col items-center gap-0.5 transition-all active:scale-90 relative -top-3 ${activeTab === 'map' ? 'text-black font-black' : 'text-gray-500 hover:text-black'}`}
                title="GiGs Map"
              >
                <div className="bg-black p-3 rounded-full shadow-lg border-4 border-white">
                  <LocateFixed className="w-8 h-8 text-white stroke-[2]" />
                </div>
                {(activeTab !== 'map' || userRole === 'User') && <span className="text-[9px] font-black uppercase tracking-[0.1em] mt-1">GiGs</span>}
              </button>
            )}

            {/* 4. Seekers Feature */}
            <button 
              onClick={() => { playSmoothClickSound(); setVerificationStep(null); setActiveTab(activeTab === 'seekers' ? 'map' : 'seekers'); }} 
              className={`flex flex-col items-center gap-0.5 transition-all active:scale-90 ${activeTab === 'seekers' ? 'text-black font-black' : 'text-gray-500 hover:text-black'}`}
              title="Seekers Directory"
            >
              <Users className="w-5 h-5 stroke-[2]" />
              {(activeTab !== 'seekers' || userRole === 'User') && <span className="text-[9px] font-bold uppercase tracking-[0.1em]">Seekers</span>}
            </button>

            {/* 5. Shop Tab (For Tenants / Main Admin) */}
            {(userRole === 'Tenant' || isMainTenant) && (
              <button 
                onClick={() => { playSmoothClickSound(); setVerificationStep(null); setActiveTab(activeTab === 'shop' ? 'map' : 'shop'); }} 
                className={`flex flex-col items-center gap-0.5 transition-all active:scale-90 relative ${activeTab === 'shop' ? 'text-black font-black' : 'text-gray-500 hover:text-black'}`}
                title="Shop"
              >
                <ShoppingBag className="w-5 h-5 stroke-[2]" />
                {(activeTab !== 'shop' || userRole === 'User') && <span className="text-[9px] font-bold uppercase tracking-[0.1em]">Shop</span>}
                <span className="absolute -top-1 -right-2 bg-amber-500 text-white text-[6px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter">CONSTRUCTION</span>
              </button>
            )}


          </>
        )}
      </div>

      {/* Admin Notification Toast */}
      {adminNotificationToast && (
        <div className="fixed top-6 left-4 right-4 z-[11500] max-w-md mx-auto bg-black text-white p-4 rounded-2xl shadow-2xl border border-white/20 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="space-y-0.5">
            <h4 className="font-black text-xs uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              {adminNotificationToast.title}
            </h4>
            <p className="text-[11px] text-gray-300 leading-snug">{adminNotificationToast.message}</p>
          </div>
          <button 
            onClick={() => setAdminNotificationToast(null)}
            className="p-1 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Account Frozen Overlay for non-main-admin */}
      {profileData.isFrozen && !isMainTenant && (
        <div className="fixed inset-0 z-[12000] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full space-y-6 shadow-2xl border border-red-100">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <Lock className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-3 py-1 rounded-full">Account Frozen</span>
              <h3 className="text-2xl font-black text-black">Tenant Account Frozen</h3>
              <p className="text-gray-500 text-xs leading-relaxed">
                Your tenant privileges have been suspended by Main Administration (<span className="font-bold text-black">timegig2026@gmail.com</span>) due to delinquency or failure to manage referral applications.
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl text-[11px] text-gray-600 text-left space-y-1 border border-gray-100">
              <p className="font-bold text-black">Resolution Steps:</p>
              <p>• Contact Main Admin at <span className="font-mono text-black font-semibold">timegig2026@gmail.com</span></p>
              <p>• Rectify any delinquent referrals or subscription payments</p>
            </div>
            <button onClick={handleLogout} className="w-full py-4 bg-black text-white font-bold rounded-2xl text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg">
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Account Taken Over Overlay */}
      {profileData.isTakenOver && !isMainTenant && (
        <div className="fixed inset-0 z-[12000] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full space-y-6 shadow-2xl border border-amber-100">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-3 py-1 rounded-full">Confiscated / Reassigned</span>
              <h3 className="text-2xl font-black text-black">Account Reassigned</h3>
              <p className="text-gray-500 text-xs leading-relaxed">
                Due to failure to manage referral applications within the 24-hour compliance deadline, this tenant account and all associated referrals have been taken over by Main Administration (<span className="font-bold text-black">timegig2026@gmail.com</span>).
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl text-[11px] text-gray-600 text-left space-y-1 border border-gray-100">
              <p className="font-bold text-black">Notice:</p>
              <p>• All subscription payments now route to Main Admin</p>
              <p>• Account management handled by <span className="font-mono text-black font-semibold">timegig2026@gmail.com</span></p>
            </div>
            <button onClick={handleLogout} className="w-full py-4 bg-black text-white font-bold rounded-2xl text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg">
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 z-[5000] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-xs w-full text-center">
            <p className="text-sm font-bold text-black mb-4">{error}</p>
            <button onClick={() => setError(null)} className="w-full py-3 bg-black text-white font-bold rounded-xl text-xs uppercase tracking-widest">Close</button>
          </div>
        </div>
      )}

      {/* Shop View (Full Screen Under Construction) */}
      <div className={`absolute inset-0 bg-gray-50/80 backdrop-blur-xl z-[45] transition-transform duration-300 flex flex-col items-center justify-center p-8 ${activeTab === 'shop' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-24 h-24 bg-amber-100 text-amber-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-inner relative">
            <ShoppingBag className="w-12 h-12" />
            <div className="absolute -top-2 -right-2 bg-black text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest border-2 border-white">Soon</div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-black tracking-tight">TimeGiG Shop</h2>
            <p className="text-gray-500 text-sm font-medium leading-relaxed">
              We are building a premium marketplace for high-performance gig tools and exclusive brand merchandise.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-left">
            <div className="p-2 bg-amber-200 rounded-xl">
              <Zap className="w-5 h-5 text-amber-700 fill-amber-700" />
            </div>
            <div>
              <p className="text-[10px] font-black text-amber-900 uppercase tracking-wider">Status: Under Construction</p>
              <p className="text-[11px] text-amber-800 font-medium">Launching in the next platform update.</p>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('map')}
            className="w-full py-4 bg-black text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all"
          >
            Back to Map
          </button>
        </div>
      </div>

      {/* Full-Screen Document / Selfie Viewer */}
      {fullScreenImage && (
        <div className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-200">
          <div className="p-4 px-6 flex items-center justify-between border-b border-white/10 text-white shrink-0">
            <div>
              <h3 className="font-black text-lg">{fullScreenImage.title}</h3>
              {fullScreenImage.subtitle && (
                <p className="text-xs text-gray-400 font-bold">{fullScreenImage.subtitle}</p>
              )}
            </div>
            <button 
              onClick={() => setFullScreenImage(null)}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-95 flex items-center gap-1.5"
            >
              <X className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Close</span>
            </button>
          </div>
          <div className="flex-1 p-4 flex items-center justify-center overflow-auto cursor-zoom-out" onClick={() => setFullScreenImage(null)}>
            {fullScreenImage?.url && <img 
              src={fullScreenImage.url} 
              alt={fullScreenImage.title} 
              className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl border border-white/10 cursor-default"
              onClick={(e) => e.stopPropagation()} 
            />}
          </div>
          <div className="p-3 text-center border-t border-white/10 text-gray-400 text-xs shrink-0">
            Click outside or tap Close to return
          </div>
        </div>
      )}

      {/* Tenant Inbox & Main Tenant Promotion Center (See-Through Glass) */}
      {showInbox && (
        <div className="fixed inset-0 z-[15000] bg-black/40 backdrop-blur-xl flex flex-col animate-in slide-in-from-bottom duration-300">
          {/* Header Bar */}
          <div className="p-3 pt-4 flex items-center justify-between bg-[#0b1a30]/80 backdrop-blur-2xl border-b border-white/10 text-white shadow-lg shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black shadow-md">
                <Megaphone className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black tracking-tight text-white">TimeGiG Promotion & Inbox Center</h3>
                  <span className="text-[8px] font-black uppercase tracking-widest bg-orange-500 text-white px-2 py-0.5 rounded-full shadow-sm">
                    Exclusive Deals
                  </span>
                </div>
                <p className="text-[9px] font-bold text-gray-300 uppercase tracking-wider">
                  Gig Applications, Nearby Gigs, Promotions & User Feedback
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMainTenantInboxTab('feedback')}
                className={`p-2 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 ${
                  mainTenantInboxTab === 'feedback'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-white/10 hover:bg-white/20 text-purple-300'
                }`}
                title="Send App Feedback & Request Features"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase hidden sm:inline">Feedback</span>
              </button>
              <button 
                onClick={() => setShowInbox(false)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Toast Notifications */}
          {promoSuccessToast && (
            <div className="mx-4 mt-3 p-3.5 bg-emerald-500 text-white rounded-2xl flex items-center justify-between text-xs font-bold shadow-lg animate-in fade-in duration-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{promoSuccessToast}</span>
              </div>
              <button onClick={() => setPromoSuccessToast(null)} className="p-1 hover:bg-white/20 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {feedbackSuccessToast && (
            <div className="mx-4 mt-3 p-3.5 bg-purple-600 text-white rounded-2xl flex items-center justify-between text-xs font-bold shadow-lg animate-in fade-in duration-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-amber-300" />
                <span>{feedbackSuccessToast}</span>
              </div>
              <button onClick={() => setFeedbackSuccessToast(null)} className="p-1 hover:bg-white/20 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Inbox View Tabs: Gig Applications, Nearby Gigs, Promotions & Feedback */}
          <div className="px-3 py-2 bg-black/40 backdrop-blur-xl border-b border-white/10 flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setMainTenantInboxTab('compose')}
              className={`flex-1 py-2 px-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                mainTenantInboxTab === 'compose'
                  ? 'bg-blue-600 text-white shadow-lg border border-blue-400'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-white/5'
              }`}
            >
              <Mail className="w-3.5 h-3.5 text-amber-400" /> Gig Apps ({messages.filter(m => m.type === 'gig_application').length})
            </button>
            <button
              onClick={() => setMainTenantInboxTab('sent')}
              className={`flex-1 py-2 px-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                mainTenantInboxTab === 'sent'
                  ? 'bg-blue-600 text-white shadow-lg border border-blue-400'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-white/5'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Nearby Gigs ({gigs.length})
            </button>
            <button
              onClick={() => setMainTenantInboxTab('direct')}
              className={`flex-1 py-2 px-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                mainTenantInboxTab === 'direct'
                  ? 'bg-orange-500 text-white shadow-lg border border-orange-300'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-white/5'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5 text-white" /> Promotions ({messages.filter(m => m.type !== 'gig_application' && m.type !== 'feedback').length})
            </button>
            <button
              onClick={() => setMainTenantInboxTab('feedback')}
              className={`flex-1 py-2 px-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                mainTenantInboxTab === 'feedback'
                  ? 'bg-purple-600 text-white shadow-lg border border-purple-400'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-white/5'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-purple-300" /> Feedback {isMainTenant && feedbacks.length > 0 ? `(${feedbacks.length})` : ''}
            </button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
            {mainTenantInboxTab === 'compose' ? (
              /* Gig Applications Section */
              <div className="max-w-xl mx-auto w-full space-y-2 pb-6">
                {(() => {
                  const appMsgs = messages.filter(m => m.type === 'gig_application');
                  if (appMsgs.length === 0) {
                    return <div className="p-8 text-center text-gray-400 text-[10px] font-bold uppercase">No Gig Applications Yet</div>;
                  }
                  return appMsgs.map(msg => {
                    const appStatus = msg.applicationStatus || 'pending';
                    return (
                      <div key={msg.id} className="p-3 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black">
                              <Mail className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <h4 className="font-black text-xs text-black">{msg.subject}</h4>
                              <p className="text-[9px] text-gray-400 font-bold">Applicant: {msg.applicantName || 'Seeker'}</p>
                            </div>
                          </div>
                          <button 
                            onClick={async () => { if (confirm('Delete application?')) await deleteDoc(doc(db, 'messages', msg.id)); }}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-600 leading-relaxed whitespace-pre-wrap bg-gray-50 p-2.5 rounded-xl border border-gray-100">{msg.body}</p>

                        {/* Interactive Hire / Decline Actions */}
                        {appStatus === 'accepted' ? (
                          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-[10px] font-bold text-emerald-900">
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Applicant Hired & Accepted!
                            </span>
                            <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Hired</span>
                          </div>
                        ) : appStatus === 'rejected' ? (
                          <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-[10px] font-bold text-red-900">
                            <span>Application Declined</span>
                            <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-800">Declined</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  const targetGig = gigs.find(g => g.id === msg.gigId);
                                  const gigLoc = targetGig?.location || msg.gigLocation || position;

                                  if (msg.appId) {
                                    await updateDoc(doc(db, 'applications', msg.appId), { status: 'accepted', gigLocation: gigLoc });
                                  }
                                  await updateDoc(doc(db, 'messages', msg.id), { applicationStatus: 'accepted', isRead: true });

                                  if (msg.applicantUid) {
                                    await addDoc(collection(db, 'messages'), {
                                      recipientId: msg.applicantUid,
                                      senderId: user!.uid,
                                      senderEmail: profileData.email || user!.email || '',
                                      senderName: profileData.name ? `${profileData.name} ${profileData.surname}` : 'Gig Owner',
                                      subject: `🎉 YOU ARE HIRED! Application Accepted for "${msg.gigTitle || 'Gig'}"`,
                                      body: `Congratulations! Your application for "${msg.gigTitle || 'Gig'}" was ACCEPTED and you have been HIRED!\n\nContact owner at ${profileData.contact || user!.email} to coordinate work details. Map navigated to destination.`,
                                      type: 'gig_hired',
                                      gigId: msg.gigId || '',
                                      gigTitle: msg.gigTitle || 'Gig',
                                      gigLocation: gigLoc || null,
                                      budget: msg.budget || 0,
                                      isRead: false,
                                      createdAt: serverTimestamp()
                                    });
                                  }

                                  playSmoothReceiveSound();

                                  if (gigLoc) {
                                    setPosition(gigLoc);
                                    setActiveAcceptedGig({
                                      id: msg.gigId || '',
                                      title: msg.gigTitle || 'Gig Destination',
                                      location: gigLoc,
                                      budget: msg.budget,
                                      applicantName: msg.applicantName
                                    });
                                  }

                                  setActiveTab('map');
                                  setShowInbox(false);
                                  alert(`🎉 You have HIRED ${msg.applicantName || 'the applicant'}! Map navigated to gig destination.`);
                                } catch (e) {
                                  console.warn('Accept application error:', e);
                                  setError('Failed to hire applicant.');
                                }
                              }}
                              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] rounded-xl uppercase tracking-wider shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Accept & Hire
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  if (msg.appId) {
                                    await updateDoc(doc(db, 'applications', msg.appId), { status: 'rejected' });
                                  }
                                  await updateDoc(doc(db, 'messages', msg.id), { applicationStatus: 'rejected', isRead: true });

                                  if (msg.applicantUid) {
                                    await addDoc(collection(db, 'messages'), {
                                      recipientId: msg.applicantUid,
                                      senderId: user!.uid,
                                      senderEmail: profileData.email || user!.email || '',
                                      senderName: profileData.name ? `${profileData.name} ${profileData.surname}` : 'Gig Owner',
                                      subject: `Application Update: ${msg.gigTitle || 'Gig'}`,
                                      body: `Your application for "${msg.gigTitle || 'Gig'}" was declined by the owner.`,
                                      type: 'gig_declined',
                                      isRead: false,
                                      createdAt: serverTimestamp()
                                    });
                                  }
                                  alert('Application declined.');
                                } catch (e) {
                                  console.warn('Decline application error:', e);
                                  setError('Failed to decline application.');
                                }
                              }}
                              className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[10px] rounded-xl uppercase tracking-wider active:scale-95 transition-all"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            ) : mainTenantInboxTab === 'sent' ? (
              /* Nearby Gigs Section */
              <div className="max-w-xl mx-auto w-full space-y-2 pb-6">
                {gigs.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-[10px] font-bold uppercase">No Nearby Gigs Available</div>
                ) : (
                  gigs.map(gig => {
                    const posterUser = allUsersList.find(u => u.uid === gig.userId);
                    const isTenantPost = gig.userRole === 'Tenant' || gig.isTenant || gig.userEmail === 'timegig2026@gmail.com' || posterUser?.role === 'Tenant' || posterUser?.email === 'timegig2026@gmail.com';
                    const posterName = gig.userName || (posterUser ? `${posterUser.name || ''} ${posterUser.surname || ''}`.trim() : '');
                    return (
                      <div key={gig.id} className="p-3.5 rounded-2xl bg-white border border-gray-100 shadow-sm space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-xl ${isTenantPost ? 'bg-amber-400 text-black' : 'bg-emerald-500 text-white'} flex items-center justify-center font-black shadow-sm`}>
                              {isTenantPost ? '👑' : <MapPin className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h4 className="font-black text-xs text-black">{gig.description || 'Gig Offer'}</h4>
                                {isTenantPost && (
                                  <span className="text-[8px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-black uppercase">Tenant</span>
                                )}
                              </div>
                              <p className="text-[9px] text-emerald-600 font-bold">Budget: R{gig.budget || 0} {posterName ? `• By ${posterName}` : ''}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (gig.location) {
                                setPosition(gig.location);
                                setActiveTab('map');
                                setShowInbox(false);
                              }
                            }}
                            className="px-3 py-1.5 bg-black text-white rounded-xl text-[9px] font-black uppercase tracking-wider active:scale-95 transition-all"
                          >
                            View on Map
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-600">{gig.contactNumber ? `Contact: ${gig.contactNumber}` : ''}</p>
                      </div>
                    );
                  })
                )}
              </div>
            ) : mainTenantInboxTab === 'direct' ? (
              /* Promotions Tab */
              <div className="max-w-xl mx-auto w-full space-y-3 pb-6">
                {/* Main Tenant Promotion Compose Text Box - ONLY for Main Tenant */}
                {isMainTenant && (
                  <div className="p-3.5 rounded-2xl bg-white/90 backdrop-blur-md border border-amber-300/40 shadow-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-amber-400 text-black flex items-center justify-center font-black shadow-sm">
                          <Megaphone className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                            Broadcast Promotion
                            <span className="text-[8px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">Main Tenant Only</span>
                          </h4>
                          <p className="text-[9px] text-gray-500 font-medium">Send promotions to referral tenants and users throughout the app</p>
                        </div>
                      </div>
                    </div>

                    {/* Target Selector */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-600">Send To</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPromoTargetType('all')}
                          className={`py-1.5 px-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                            promoTargetType === 'all'
                              ? 'bg-black text-white shadow'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          All Network
                        </button>
                        <button
                          type="button"
                          onClick={() => setPromoTargetType('tenants')}
                          className={`py-1.5 px-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                            promoTargetType === 'tenants'
                              ? 'bg-black text-white shadow'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Referral Tenants
                        </button>
                        <button
                          type="button"
                          onClick={() => setPromoTargetType('users')}
                          className={`py-1.5 px-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                            promoTargetType === 'users'
                              ? 'bg-black text-white shadow'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Referral Users
                        </button>
                      </div>
                    </div>

                    {/* Subject Input */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-600">Promotion Subject</label>
                      <input
                        type="text"
                        value={promoSubject}
                        onChange={(e) => setPromoSubject(e.target.value)}
                        placeholder="e.g. Weekend Commission Boost or Special Feature Announcement"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>

                    {/* Promotion Body Text Box */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-gray-600">Promotion Message Body</label>
                      <textarea
                        rows={3}
                        value={promoBody}
                        onChange={(e) => setPromoBody(e.target.value)}
                        placeholder="Type promotional details, discounts, bonuses or alerts to send across the app..."
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none leading-relaxed"
                      />
                    </div>

                    {/* Send Button */}
                    <button
                      type="button"
                      disabled={isBroadcasting || !promoSubject.trim() || !promoBody.trim()}
                      onClick={() => handleSendPromotion()}
                      className="w-full py-2.5 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-black font-black text-xs rounded-xl uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isBroadcasting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sending Promotion...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" /> Broadcast Promotion Message
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Featured Promotion Banner */}
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-orange-500 rounded-2xl p-4 text-white shadow-xl border border-white/20 space-y-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Megaphone className="w-24 h-24 text-white" />
                  </div>
                  <span className="bg-white/20 text-white text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-widest">
                    🔥 Daily Deal & Promotion Spotlight
                  </span>
                  <h4 className="text-base font-black tracking-tight">Expand Your Local Network!</h4>
                  <p className="text-[11px] text-white/90 leading-snug">
                    Grow your network as a TimeGiG Tenant. Refer new verified job seekers and tenants during our promotional window to build your team.
                  </p>
                </div>

                {/* List of Promotions */}
                {(() => {
                  const promoMsgs = messages.filter(m => {
                    if (m.type === 'gig_application' || m.type === 'feedback') return false;
                    if (m.targetAudience === 'tenants' && !isMainTenant && userRole !== 'Tenant') return false;
                    if (m.targetAudience === 'users' && !isMainTenant && userRole === 'Tenant') return false;
                    return true;
                  });
                  if (promoMsgs.length === 0) {
                    return (
                      <div className="p-8 text-center bg-white/40 backdrop-blur-md rounded-2xl border border-white/20 space-y-2">
                        <Megaphone className="w-8 h-8 text-orange-500 mx-auto" />
                        <p className="text-gray-700 font-bold text-xs">No active administrative promotions right now.</p>
                      </div>
                    );
                  }
                  return promoMsgs.map(msg => (
                    <div key={msg.id} className="p-4 rounded-2xl bg-white/80 backdrop-blur-md border border-white/20 shadow-md space-y-2 relative overflow-hidden group">
                      <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-orange-500" />
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black shadow-sm">
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h4 className="font-black text-xs text-black">{msg.subject}</h4>
                            <p className="text-[8px] text-orange-600 font-bold uppercase tracking-wider">
                              {msg.targetAudience === 'tenants' ? 'Tenants Special Promotion' : msg.targetAudience === 'users' ? 'Users Special Promotion' : 'TimeGiG Official Promotion'}
                            </p>
                          </div>
                        </div>
                        {canManagePromotions && (
                          <button 
                            onClick={async () => { if (confirm('Delete promotion?')) await deleteDoc(doc(db, 'messages', msg.id)); }}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete Promotion"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-700 leading-relaxed whitespace-pre-wrap bg-white/50 p-3 rounded-xl border border-gray-100 font-medium">{msg.body}</p>
                      <div className="flex items-center justify-between text-[8px] font-black uppercase text-gray-400 pt-1">
                        <span>{msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleString() : 'Recently'}</span>
                        <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">Verified Promotion</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              /* Feedback Tab */
              <div className="max-w-xl mx-auto w-full space-y-3 pb-6">
                {/* Feedback Intro Banner */}
                <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 rounded-2xl p-4 text-white shadow-xl border border-white/20 space-y-1.5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <MessageSquare className="w-24 h-24 text-white" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-white/20 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-full tracking-widest flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-amber-300" /> User Voice
                    </span>
                    <span className="text-[9px] text-purple-200 font-bold uppercase tracking-wider">Direct to Main Tenant</span>
                  </div>
                  <h4 className="text-base font-black tracking-tight">App Feedback & Feature Requests</h4>
                  <p className="text-[11px] text-purple-100 leading-snug">
                    What features do you want in TimeGiG? Send us your suggestions, ideas, or feedback directly.
                  </p>
                </div>

                {/* Send Feedback Text Box Card */}
                <div className="p-4 rounded-2xl bg-white/90 backdrop-blur-md border border-white/30 shadow-xl space-y-3">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
                    <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black shadow-sm">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-black">Submit Your Feedback</h4>
                      <p className="text-[9px] text-gray-500 font-medium">Tell us what features you want or how we can improve</p>
                    </div>
                  </div>

                  {/* Category Selection */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-600">Category</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {(['Feature Request', 'App Improvement', 'Idea', 'Bug Report'] as const).map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setFeedbackCategory(cat)}
                          className={`py-1.5 px-2 rounded-xl text-[9px] font-black uppercase transition-all ${
                            feedbackCategory === cat
                              ? 'bg-purple-600 text-white shadow font-black'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 font-bold'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Feedback Text Box */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-600">Your Feedback & Requested Features</label>
                    <textarea
                      rows={4}
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Type your feedback here... What features do you want us to add? What would make your experience better?"
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none leading-relaxed"
                    />
                    <div className="flex items-center justify-between text-[9px] text-gray-400 px-1">
                      <span>Constructive feedback helps shape future releases</span>
                      <span>{feedbackText.length} characters</span>
                    </div>
                  </div>

                  {/* Submit Feedback Button */}
                  <button
                    type="button"
                    disabled={isSubmittingFeedback || !feedbackText.trim()}
                    onClick={() => handleSendFeedback()}
                    className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmittingFeedback ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sending Feedback...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" /> Send Feedback to Main Tenant
                      </>
                    )}
                  </button>
                </div>

                {/* Main Tenant View: All User Feedback Submissions */}
                {isMainTenant && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-purple-300" />
                        Community Feedback ({feedbacks.length})
                      </h4>
                      <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30">
                        Main Tenant Review
                      </span>
                    </div>

                    {feedbacks.length === 0 ? (
                      <div className="p-6 text-center bg-white/40 backdrop-blur-md rounded-2xl border border-white/20">
                        <p className="text-gray-700 font-bold text-xs">No feedback or feature requests received yet.</p>
                        <p className="text-gray-500 text-[10px] mt-1">When users submit feedback about requested features, they will appear here.</p>
                      </div>
                    ) : (
                      feedbacks.map(fb => (
                        <div key={fb.id} className="p-3.5 rounded-2xl bg-white/90 backdrop-blur-md border border-white/20 shadow-md space-y-2 relative overflow-hidden">
                          <div className="flex items-start justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-black text-black">{fb.userName || 'Member'}</span>
                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                                  {fb.userRole || 'User'}
                                </span>
                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                                  {fb.category || 'Feedback'}
                                </span>
                              </div>
                              <p className="text-[9px] text-gray-500">{fb.userEmail}</p>
                            </div>
                            <button
                              onClick={() => handleDeleteFeedback(fb.id)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              title="Delete Feedback"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-800 leading-relaxed whitespace-pre-wrap bg-gray-50 p-2.5 rounded-xl border border-gray-100 font-medium">
                            {fb.feedbackText}
                          </p>
                          <div className="flex items-center justify-between text-[8px] font-bold text-gray-400 pt-0.5">
                            <span>{fb.createdAt?.toDate ? fb.createdAt.toDate().toLocaleString() : 'Recently'}</span>
                            <span className="text-emerald-600 font-black">Delivered</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Regular User / Referral Tenant View: Their Own Previously Submitted Feedback */}
                {!isMainTenant && feedbacks.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-white px-1">Your Submitted Feedback ({feedbacks.length})</h4>
                    {feedbacks.map(fb => (
                      <div key={fb.id} className="p-3 rounded-2xl bg-white/80 backdrop-blur-md border border-white/20 shadow-sm space-y-1.5">
                        <div className="flex items-center justify-between text-[9px]">
                          <span className="font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 uppercase">{fb.category}</span>
                          <span className="text-gray-500">{fb.createdAt?.toDate ? fb.createdAt.toDate().toLocaleDateString() : 'Recently'}</span>
                        </div>
                        <p className="text-[10px] text-gray-700 bg-white/50 p-2 rounded-xl">{fb.feedbackText}</p>
                        <div className="flex items-center justify-end">
                          <span className="text-[8px] font-black text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Received by Main Administration
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* Tenant Screen - Approval Success Popup */}
      {tenantApprovalPopup && (
        <div className="fixed inset-0 z-[11000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full text-center shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] bg-emerald-50 px-3 py-1 rounded-full">Activated</span>
              <h3 className="text-2xl font-black text-black">Submission Approved!</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                <strong className="text-black">{tenantApprovalPopup.name}</strong> has been successfully verified & activated as a <strong>{tenantApprovalPopup.type}</strong>.
              </p>
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 text-xs text-gray-700 font-bold space-y-2">
                <p className="text-emerald-600 font-black flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Account Verified & Active
                </p>
                {tenantApprovalPopup.profitAmount && (
                  <p className="text-emerald-700 font-black text-xs bg-emerald-50 py-2 px-3 rounded-xl border border-emerald-200">
                    💰 +R{tenantApprovalPopup.profitAmount} Received ({tenantApprovalPopup.profitLabel}) → Added to Total Profit Balance
                  </p>
                )}
                <p className="text-gray-400 text-[10px] font-medium">Added to your verified referral network & profit balance.</p>
              </div>
            </div>
            <button 
              onClick={() => setTenantApprovalPopup(null)}
              className="w-full py-4 bg-black text-white font-black rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-widest shadow-lg shadow-black/20"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Referral's Screen - Activated Celebration Popup */}
      {showReferralActivatedPopup && (
        <div className="fixed inset-0 z-[11000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full text-center shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 relative overflow-hidden border border-gray-100">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600" />
            <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-100">
              <Sparkles className="w-10 h-10 animate-pulse text-emerald-500" />
            </div>
            <div className="space-y-2">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] bg-emerald-50 px-3 py-1 rounded-full">Official Activation</span>
              <h3 className="text-2xl font-black text-black tracking-tight">Account Activated!</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Congratulations! Your verification documents and payment have been approved by the tenant. Your profile is now officially verified.
              </p>
              <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-100 text-xs text-emerald-900 font-bold text-left space-y-1.5">
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0" /> Verified badge active on your profile</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0" /> Free to apply for local on-demand gigs</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0" /> Personal referral link to grow your verified network</div>
              </div>
            </div>
            <button 
              onClick={() => {
                setShowReferralActivatedPopup(false);
                setVerificationStep(null);
                if (isProfileComplete()) {
                  setActiveTab('map');
                } else {
                  setActiveTab('profile');
                }
              }}
              className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-widest shadow-xl shadow-emerald-200"
            >
              {isProfileComplete() ? 'Explore GiGs Map Now' : 'Complete Profile Now (Required)'}
            </button>
          </div>
        </div>
      )}

      {/* Welcome Back Greeting Popup */}
      {showWelcomeBackPopup && (
        <div className="fixed inset-0 z-[11000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full text-center shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 relative overflow-hidden border border-gray-100">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-400 via-indigo-500 to-blue-600" />
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-blue-100">
              <User className="w-10 h-10 text-blue-500" />
            </div>
            <div className="space-y-2">
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] bg-blue-50 px-3 py-1 rounded-full">Secure Login</span>
              <h3 className="text-2xl font-black text-black tracking-tight">Welcome Back!</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Good to see you again. Your account is active and verified. Explore the map for new gigs or manage your referrals.
              </p>
            </div>
            <button 
              onClick={() => {
                setShowWelcomeBackPopup(false);
                setActiveTab('map');
              }}
              className="w-full py-4 bg-black text-white font-black rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-widest shadow-xl"
            >
              Go to Map
            </button>
          </div>
        </div>
      )}



      {/* Feature Help Modal */}
      {helpInfo && (
        <div className="fixed inset-0 z-[12000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full text-center shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-md">
              <HelpCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-black">{helpInfo.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{helpInfo.content}</p>
            </div>
            <button 
              onClick={() => setHelpInfo(null)}
              className="w-full py-4 bg-black text-white font-black rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-widest shadow-lg"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Splash Screen (TimeGiG alone in white on black background for 5 seconds) */}
      {showSplash && (
        <div 
          onClick={() => setShowSplash(false)}
          className="fixed inset-0 z-[20000] bg-black flex items-center justify-center cursor-pointer animate-in fade-in duration-300"
        >
          <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter select-none">TimeGiG</h1>
        </div>
      )}

      {/* Fees & Bank Details Settings Modal */}
      {showFeesModal && (
        <div className="fixed inset-0 z-[12500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md ${showFeesModal.type === 'Tenant' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                  <CreditCard className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-black">{showFeesModal.type} Subscription</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Set Referral Fee & Bank Details</p>
                </div>
              </div>
              <button 
                onClick={() => setShowFeesModal(null)}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subscription Fee (R)</label>
                <input 
                  type="number" 
                  value={showFeesModal.fee} 
                  onChange={e => setShowFeesModal({...showFeesModal, fee: Number(e.target.value)})}
                  className="w-full bg-gray-50 p-4 rounded-2xl text-lg font-black text-black border-2 border-gray-100 focus:border-black outline-none transition-all"
                />
                <p className="text-[9px] text-gray-400 font-bold uppercase italic">This is the amount referrals will pay for their {showFeesModal.type.toLowerCase()} account.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Your Bank Transfer Details</label>
                <textarea 
                  value={profileData.bankTransferDetails} 
                  onChange={e => setProfileData({...profileData, bankTransferDetails: e.target.value})}
                  placeholder="Bank Name:&#10;Account Number:&#10;Branch Code:&#10;Reference: Your Name"
                  className="w-full bg-gray-50 p-4 rounded-2xl text-sm font-bold text-black border-2 border-gray-100 focus:border-black outline-none transition-all min-h-[120px]"
                />
                <p className="text-[9px] text-gray-400 font-bold uppercase italic">Enter where you want referrals to pay their subscription fees.</p>
              </div>
            </div>

            <button 
              onClick={async () => {
                try {
                  const updateObj: any = {
                    bankTransferDetails: profileData.bankTransferDetails
                  };
                  if (showFeesModal.type === 'Tenant') {
                    updateObj.tenantSubFee = showFeesModal.fee;
                  } else {
                    updateObj.userSubFee = showFeesModal.fee;
                  }
                  await updateDoc(doc(db, 'users', user!.uid), updateObj);
                  setShowFeesModal(null);
                } catch (err) {
                  console.error('Update fees error:', err);
                  setError('Failed to update settings. Please try again.');
                }
              }}
              className="w-full py-5 bg-black text-white font-black rounded-2xl active:scale-95 transition-all shadow-xl shadow-black/20 uppercase tracking-[0.2em] text-xs"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[12500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-6 max-w-sm w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 border border-gray-100 max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-black text-white rounded-2xl flex items-center justify-center shadow-md">
                  <Settings className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-black">Settings</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Preferences & Alerts</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sound & Notifications Section */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Sound Notifications</span>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {soundEnabled ? <Volume2 className="w-5 h-5 text-emerald-600" /> : <VolumeX className="w-5 h-5 text-gray-400" />}
                    <div>
                      <p className="text-xs font-bold text-black">Audio Chimes</p>
                      <p className="text-[10px] text-gray-500">Alerts for referrals & new gigs</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { playSmoothClickSound(); setSoundEnabled(!soundEnabled); }}
                    className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${soundEnabled ? 'bg-black' : 'bg-gray-300'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${soundEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="pt-2 border-t border-gray-200/60 flex flex-wrap gap-2">
                  <button 
                    onClick={playSmoothClickSound}
                    className="flex-1 min-w-[100px] py-2 px-2.5 bg-white hover:bg-gray-100 text-black border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Target className="w-3.5 h-3.5 text-black" /> Test Click
                  </button>
                  <button 
                    onClick={playSmoothReceiveSound}
                    className="flex-1 min-w-[100px] py-2 px-2.5 bg-white hover:bg-gray-100 text-black border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Bell className="w-3.5 h-3.5 text-blue-600" /> Test Receive
                  </button>
                  <button 
                    onClick={playSmoothAlarmSound}
                    className="flex-1 min-w-[100px] py-2 px-2.5 bg-white hover:bg-gray-100 text-black border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-600" /> Test Alarm
                  </button>
                </div>
              </div>
            </div>

            {/* Map View Preference */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Map Preference</span>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Layers className={`w-5 h-5 ${isSatellite ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-xs font-bold text-black">Satellite Map View</p>
                    <p className="text-[10px] text-gray-500">Persists across logout, login & reloads</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    playSmoothClickSound();
                    const nextVal = !isSatellite;
                    try {
                      localStorage.setItem('timegig_is_satellite', String(nextVal));
                    } catch (e) {
                      console.warn('Satellite storage error:', e);
                    }
                    setIsSatellite(nextVal);
                  }}
                  className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${isSatellite ? 'bg-blue-600' : 'bg-gray-300'}`}
                  title="Toggle Satellite View"
                >
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${isSatellite ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* Account Details */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Account Overview</span>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
                  <span className="text-gray-500 font-bold">Email</span>
                  <span className="font-bold text-black truncate max-w-[170px]">{user?.email || 'Guest User'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-gray-200/60">
                  <span className="text-gray-500 font-bold">Role</span>
                  <span className="font-black text-black">{userRole}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-gray-500 font-bold">Status</span>
                  <span className={`font-black uppercase text-[10px] px-2 py-0.5 rounded-full ${isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {isApproved ? 'Verified Account' : 'Pending Verification'}
                  </span>
                </div>
              </div>
            </div>

            <button 
              onClick={() => { playSmoothClickSound(); setShowSettingsModal(false); }}
              className="w-full py-4 bg-black text-white font-black rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-widest shadow-lg shadow-black/20"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Referral Welcome Modal (For Users invited via Tenant Link) */}
      {showWelcomeModal && (
        <div className="fixed inset-0 z-[11000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full text-center shadow-2xl space-y-6 animate-in zoom-in-95 duration-200 relative border border-gray-100">
            <button 
              onClick={() => {
                setShowWelcomeModal(false);
                sessionStorage.setItem('welcome_dismissed', 'true');
              }}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-black transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-md">
              <ShieldCheck className="w-10 h-10 text-blue-600" />
            </div>
            <div className="space-y-2">
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] bg-blue-50 px-3 py-1 rounded-full">Trusted Independent App</span>
              <h3 className="text-2xl font-black text-black tracking-tight">Welcome to TimeGiG!</h3>
              <p className="text-black text-xs leading-relaxed font-medium">
                TimeGiG was built because of unemployment and is a trusted independent app connecting local job seekers with gig owners. You were invited by a partner Tenant to join our verified on-demand gig network.
              </p>
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 text-xs text-gray-700 font-medium text-left space-y-1.5">
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0" /> Find on-demand gigs near you on the live map</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0" /> Fast verification with photo ID & selfie</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0" /> Build and manage your own verified local network</div>
              </div>
            </div>
            <div className="space-y-2">
              {!user ? (
                <>
                  <button 
                    onClick={() => {
                      setShowWelcomeModal(false);
                      sessionStorage.setItem('welcome_dismissed', 'true');
                      setActiveTab('auth');
                      handleLogin();
                    }}
                    className="w-full py-4 bg-black text-white font-black rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2"
                  >
                    <LogIn className="w-4 h-4" /> Sign In & Claim Invite
                  </button>
                  <button 
                    onClick={() => {
                      setShowWelcomeModal(false);
                      sessionStorage.setItem('welcome_dismissed', 'true');
                      setActiveTab('auth');
                    }}
                    className="w-full py-3.5 bg-gray-100 text-black font-bold rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-wider"
                  >
                    Register with Email
                  </button>
                </>
              ) : (
                <div className="space-y-2">
                  <button 
                    onClick={() => {
                      setShowWelcomeModal(false);
                      sessionStorage.setItem('welcome_dismissed', 'true');
                      setActiveTab('map');
                    }}
                    className="w-full py-4 bg-black text-white font-black rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2"
                  >
                    <LocateFixed className="w-4 h-4 text-white" /> Explore GiGs Map & Seekers
                  </button>
                  {!isApproved && (
                    <button 
                      onClick={() => {
                        setShowWelcomeModal(false);
                        sessionStorage.setItem('welcome_dismissed', 'true');
                        setActiveTab('activation');
                      }}
                      className="w-full py-3 bg-gray-100 text-black font-bold rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-wider"
                    >
                      Complete Account Activation
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Gig Creation Form */}
      {showGigForm && (
        <div className="absolute top-20 left-4 right-4 z-[5000] bg-white/95 p-6 rounded-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
          <h2 className="text-2xl font-black text-black mb-2">{showGigForm === true ? 'Create a Gig' : 'Edit Gig'}</h2>
          <p className="text-base font-bold text-black mb-1">Click on the map to set the gig location.</p>
          <p className="text-xs text-gray-500 mb-6">Selected: {selectedGigLocation ? `${selectedGigLocation[0].toFixed(4)}, ${selectedGigLocation[1].toFixed(4)}` : 'No location selected'}</p>
          <div className="space-y-4">
            <input type="text" placeholder="Description" className="w-full p-4 border rounded-xl text-black font-bold" id="gig-desc" defaultValue={showGigForm !== true ? showGigForm.description : ''} />
            <div className="relative w-full">
              <input 
                type="text" 
                placeholder="Type location address..." 
                className="w-full p-4 border rounded-xl text-black font-bold" 
                id="gig-address" 
                value={searchQuery}
                onChange={handleQueryChange}
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-[6000] w-full bg-white border border-gray-100 mt-1 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <li 
                      key={index}
                      onClick={() => {
                        setSelectedGigLocation([parseFloat(suggestion.lat), parseFloat(suggestion.lon)]);
                        setSearchQuery(suggestion.display_name);
                        setShowSuggestions(false);
                      }}
                      className="px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer border-b border-gray-50"
                    >
                      {suggestion.display_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <input type="number" placeholder="Budget" className="w-full p-4 border rounded-xl text-black" id="gig-budget" defaultValue={showGigForm !== true ? showGigForm.budget : ''} />
            <input type="text" placeholder="Contact Number" className="w-full p-4 border rounded-xl text-black" id="gig-contact" defaultValue={showGigForm !== true ? showGigForm.contactNumber : ''} />
            <div className="flex gap-4">
              <input type="date" className="flex-1 p-4 border rounded-xl text-black" id="gig-date" defaultValue={showGigForm !== true ? showGigForm.date : ''} />
              <input type="time" className="flex-1 p-4 border rounded-xl text-black" id="gig-time" defaultValue={showGigForm !== true ? showGigForm.time : ''} />
            </div>
            <label className="flex items-center gap-2 text-black">
              <input type="checkbox" id="gig-immediate" defaultChecked={showGigForm !== true ? showGigForm.isImmediate : false} /> Immediate Assistance
            </label>
            <input type="text" placeholder="Experience Needed" className="w-full p-4 border rounded-xl text-black" id="gig-exp" defaultValue={showGigForm !== true ? showGigForm.experienceNeeded : ''} />
            <button
              onClick={async () => {
                const desc = (document.getElementById('gig-desc') as HTMLInputElement).value;
                const budget = parseFloat((document.getElementById('gig-budget') as HTMLInputElement).value);
                const contact = (document.getElementById('gig-contact') as HTMLInputElement).value;
                const date = (document.getElementById('gig-date') as HTMLInputElement).value;
                const time = (document.getElementById('gig-time') as HTMLInputElement).value;
                const immediate = (document.getElementById('gig-immediate') as HTMLInputElement).checked;
                const exp = (document.getElementById('gig-exp') as HTMLInputElement).value;
                let finalLocation = selectedGigLocation || (showGigForm !== true ? showGigForm.location : position);

                if (!desc || !finalLocation) {
                    setError('Description and location are required.');
                    return;
                }

                try {
                  const isTenantUser = userRole === 'Tenant' || isMainTenant;
                  const posterName = profileData.name ? `${profileData.name} ${profileData.surname || ''}`.trim() : (user?.displayName || (isMainTenant ? 'TimeGiG Admin' : 'Tenant'));
                  const gigData = {
                    userId: user?.uid,
                    userName: posterName,
                    userRole: userRole || (isMainTenant ? 'Tenant' : 'User'),
                    isTenant: isTenantUser,
                    userPhoto: selfieImage || user?.photoURL || null,
                    userEmail: user?.email || '',
                    description: desc,
                    budget: budget,
                    contactNumber: contact,
                    date: date,
                    time: time,
                    isImmediate: immediate,
                    location: finalLocation,
                    experienceNeeded: exp,
                    updatedAt: serverTimestamp()
                  };
                  if (showGigForm === true) {
                    await addDoc(collection(db, 'gigs'), { ...gigData, createdAt: serverTimestamp() });
                  } else {
                    await updateDoc(doc(db, 'gigs', showGigForm.id), gigData);
                  }
                  setShowGigForm(null);
                  setSelectedGigLocation(null);
                } catch (err) {
                  console.warn('Save gig notice:', err);
                  setError('Failed to save gig.');
                }
              }}
              className="w-full py-4 bg-black text-white font-bold rounded-xl"
            >{showGigForm === true ? 'Post Gig' : 'Save Changes'}</button>
            <button
              onClick={() => setShowGigForm(null)}
              className="w-full py-4 bg-gray-200 text-black font-bold rounded-xl"
            >Cancel</button>
          </div>
        </div>
      )}
      {/* Full-Screen Gig View */}
      {selectedGigView && (
        <div className="absolute inset-0 z-[6000] bg-white p-6 overflow-y-auto">
          <button onClick={() => setSelectedGigView(null)} className="mb-6">
            <X className="w-8 h-8" />
          </button>
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden">
            <div className="p-8 pb-0">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shadow-inner">
                    {(selectedGigView.userPhoto && selectedGigView.userPhoto !== "") ? (
                        <img src={selectedGigView.userPhoto} alt="Owner" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 font-black text-2xl">
                            {(selectedGigView.userName || 'O')[0]}
                        </div>
                    )}
                </div>
                <div>
                    <h2 className="text-2xl font-black text-black leading-none mb-1">Gig Details</h2>
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">{selectedGigView.userName || 'Owner'}</p>
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 space-y-6">
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-4">
                <p className="text-base text-gray-900 font-bold leading-relaxed">"{selectedGigView.description}"</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Budget</p>
                    <p className="text-xl font-black text-emerald-600">R{selectedGigView.budget}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Date & Time</p>
                    <p className="text-sm font-black text-black">{selectedGigView.date} @ {selectedGigView.time}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Contact</p>
                  <p className="text-sm font-bold text-black">{selectedGigView.contactNumber}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Experience Needed</p>
                  <p className="text-sm font-medium text-gray-700 leading-relaxed">{selectedGigView.experienceNeeded || 'No specific experience listed'}</p>
                </div>
              </div>
            </div>
          </div>
          {/* Prevent user from applying to their own gig post or hiring themselves */}
          {selectedGigView.userId === user?.uid ? (
            <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl mb-6 font-bold text-xs flex items-center gap-3 shadow-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-black uppercase tracking-wider text-[11px] text-amber-900">Your Own Gig Listing</p>
                <p className="text-[11px] text-amber-800 font-medium leading-relaxed mt-0.5">
                  You created this gig post. You cannot apply to your own gig post or hire yourself.
                </p>
              </div>
            </div>
          ) : (
            <button 
              disabled={isApplying || (profileData.applicationChances || 5) <= 0}
              onClick={async () => {
                if (!user) { alert('Please login to apply.'); return; }
                if (selectedGigView.userId === user.uid) {
                  alert('You cannot apply to your own gig post or hire yourself.');
                  return;
                }
                setIsApplying(true);
                const appId = doc(collection(db, 'applications')).id;
                const applicantName = profileData.name && profileData.surname 
                  ? `${profileData.name} ${profileData.surname}` 
                  : (user.displayName || user.email || 'Applicant');

                await setDoc(doc(db, 'applications', appId), {
                  gigId: selectedGigView.id,
                  gigTitle: selectedGigView.description || 'Gig Listing',
                  budget: selectedGigView.budget || 0,
                  ownerId: selectedGigView.userId || '',
                  userId: user.uid,
                  applicantName,
                  applicantContact: profileData.contact || '',
                  applicantEmail: profileData.email || user.email || '',
                  applicantTrade: profileData.workTrade || profileData.experience || '',
                  status: 'pending',
                  createdAt: serverTimestamp()
                });

                // Deliver offline-accessible persistent inbox notification to the gig owner
                if (selectedGigView.userId && selectedGigView.userId !== user.uid) {
                  await addDoc(collection(db, 'messages'), {
                    recipientId: selectedGigView.userId,
                    senderId: user.uid,
                    senderEmail: profileData.email || user.email || '',
                    senderName: applicantName,
                    subject: `💼 New Gig Application: ${selectedGigView.description}`,
                    body: `${applicantName} applied for your gig "${selectedGigView.description}" (Budget: R${selectedGigView.budget}).\n\nContact: ${profileData.contact || 'Not provided'}\nEmail: ${profileData.email || user.email}\nTrade/Experience: ${profileData.workTrade || profileData.experience || 'Not specified'}`,
                    type: 'gig_application',
                    appId: appId,
                    gigId: selectedGigView.id,
                    gigTitle: selectedGigView.description,
                    gigLocation: selectedGigView.location || null,
                    applicantUid: user.uid,
                    applicantName: applicantName,
                    applicantContact: profileData.contact || '',
                    applicantEmail: profileData.email || user.email || '',
                    applicationStatus: 'pending',
                    isRead: false,
                    createdAt: serverTimestamp()
                  }).catch(e => console.warn('Gig application notification notice:', e));
                }

                await updateDoc(doc(db, 'users', user.uid), {
                  applicationChances: (profileData.applicationChances || 5) - 1
                });
                setProfileData(prev => ({...prev, applicationChances: (prev.applicationChances || 5) - 1}));

                let timeout = setTimeout(() => {
                  setIsApplying(false);
                  alert('Application submitted! The gig owner has received your application in their inbox.');
                  unsubscribe();
                }, 60000);

                const unsubscribe = onSnapshot(doc(db, 'applications', appId), (doc) => {
                  const data = doc.data();
                  if (data?.status === 'accepted') {
                    clearTimeout(timeout);
                    unsubscribe();
                    setIsApplying(false);
                    setSelectedGigView(null);
                    if (selectedGigView.location) {
                      setPosition(selectedGigView.location); // Navigate to location
                      setActiveAcceptedGig({
                        id: selectedGigView.id,
                        title: selectedGigView.description || 'Gig Destination',
                        location: selectedGigView.location,
                        budget: selectedGigView.budget,
                        ownerName: selectedGigView.contactNumber
                      });
                    }
                    setActiveTab('map');
                    alert('🎉 Congratulations! You were HIRED by the gig owner! Map navigated to gig destination.');
                  } else if (data?.status === 'rejected') {
                    clearTimeout(timeout);
                    unsubscribe();
                    setIsApplying(false);
                    alert('Application update: The owner declined this application.');
                  }
                }, (err) => {
                  console.warn('Application snapshot notice:', err);
                });
              }}
              className="w-full py-4 bg-black text-white font-bold rounded-2xl mb-4 disabled:opacity-50 active:scale-98 transition-all"
            >
              {isApplying ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Applying...
                </div>
              ) : `Apply for Gig (${profileData.applicationChances || 5} chances left)`}
            </button>
          )}
          {selectedGigView.userId === user?.uid && (
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  setShowGigForm(selectedGigView);
                  setSelectedGigView(null);
                }}
                className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl">Edit Gig</button>
              <button 
                onClick={async () => {
                    if (confirm('Are you sure you want to delete this gig?')) {
                        try {
                            await deleteDoc(doc(db, 'gigs', selectedGigView.id));
                            setSelectedGigView(null);
                        } catch (err) {
                            console.warn('Delete gig notice:', err);
                            alert('Failed to delete gig.');
                        }
                    }
                }}
                className="flex-1 py-4 bg-red-600 text-white font-bold rounded-2xl">Delete Gig</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
