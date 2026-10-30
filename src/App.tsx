/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Compass, Search, LocateFixed, Zap, X, Plus, Minus, Layers, Check, Camera, FileText, CreditCard, Clock, ChevronLeft, Upload, RefreshCw, Scan, LayoutGrid, Users, Trash2, User, Mail, Phone, Link2, Briefcase, Star, MapPinned, Lock, Unlock, Globe, Target, LogIn, LogOut } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';

// Fix for default marker icons in Leaflet when using Vite/Webpack
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function ZoomControls({ isSatellite, setIsSatellite }: { isSatellite: boolean, setIsSatellite: (val: boolean) => void }) {
  const map = useMap();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
        <button
          onClick={() => map.zoomIn()}
          className="p-3 hover:bg-gray-50 border-b border-gray-100 text-black transition-colors"
          title="Zoom In"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          onClick={() => map.zoomOut()}
          className="p-3 hover:bg-gray-50 border-b border-gray-100 text-black transition-colors"
          title="Zoom Out"
        >
          <Minus className="w-5 h-5" />
        </button>
        <button
          onClick={() => setIsSatellite(!isSatellite)}
          className={`p-3 hover:bg-gray-50 transition-colors ${isSatellite ? 'text-blue-600 bg-blue-50' : 'text-black'}`}
          title="Toggle Satellite View"
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
  name: string;
  type: 'Tenant' | 'User';
  selfie: string;
  idDoc: string;
  pop: string;
  date: string;
  isViewed?: boolean;
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
  const [isSatellite, setIsSatellite] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'activation' | 'tenant' | 'profile' | 'auth'>('map');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userRole, setUserRole] = useState<'User' | 'Tenant'>('User');
  const [verificationStep, setVerificationStep] = useState<VerificationStep>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [referralView, setReferralView] = useState<Referral | null>(null);
  const [showReferralList, setShowReferralList] = useState(false);
  const [stats, setStats] = useState({ tenantProfit: 0, userProfit: 0, totalReferrals: 0 });

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
    userProfit: 0
  });

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
  const debounceTimer = useRef<NodeJS.Timeout>();

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
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    // Don't throw to avoid crashing the whole app, but set error state
    setError(`Permission Error: ${operationType} on ${path}`);
  };

  // Firebase Auth Listener
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch or create user profile
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserRole(data.role || 'User');
          setIsApproved(data.isApproved || false);
          setProfileLocked(data.profileLocked || false);
          setLastLogoUpdate(data.lastLogoUpdate || null);
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
            referrerId: data.referrerId || '',
            tenantProfit: data.tenantProfit ?? 0,
            userProfit: data.userProfit ?? 0
          });
          if (data.photoURL) setSelfieImage(data.photoURL);
        } else {
          // New user
          const params = new URLSearchParams(window.location.search);
          const referrerId = params.get('ref') || '';
          
          const initialData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: firebaseUser.email === 'timegig2026@gmail.com' ? 'Tenant' : 'User', // Bootstrap admin
            isApproved: firebaseUser.email === 'timegig2026@gmail.com',
            createdAt: serverTimestamp(),
            applicationChances: 5,
            referrerId: referrerId,
            tenantProfit: 0,
            userProfit: 0
          };
          await setDoc(userDocRef, initialData);
          setUserRole(initialData.role as 'User' | 'Tenant');
          setIsApproved(initialData.isApproved);
        }
      } else {
        // Reset states on logout
        setUserRole('User');
        setIsApproved(false);
        setSelfieImage(null);
        setProfileData({
          name: '', surname: '', contact: '', email: '', location: '',
          workTrade: '', experience: '', reference: '', socialLinks: [''], referrerId: ''
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen for referrals if Tenant
  useEffect(() => {
    if (!db || !user || userRole !== 'Tenant') {
      setReferrals([]);
      return;
    }
    // Listen for users referred by this tenant
    const path = 'users';
    const q = query(collection(db, path), where('referrerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const refs: Referral[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        refs.push({
          id: doc.id,
          name: (data.name || '') + ' ' + (data.surname || ''),
          type: 'User',
          selfie: data.photoURL || '',
          idDoc: '', // Not directly available for referred users yet
          pop: '', 
          date: data.createdAt?.toDate().toLocaleDateString() || 'Recently',
          isViewed: data.isViewed || false
        });
      });
      setReferrals(refs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsubscribe();
  }, [user, userRole]);

  // Listen for Gigs
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'gigs'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const gs: any[] = [];
      snapshot.forEach((doc) => {
        gs.push({ id: doc.id, ...doc.data() });
      });
      setGigs(gs);
    });
    return () => unsubscribe();
  }, []);

  // Listen for system stats
  useEffect(() => {
    if (!db || !user) return;
    const path = 'system/platform_stats';
    const unsubscribe = onSnapshot(doc(db, 'system', 'platform_stats'), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setStats({
          tenantProfit: data.tenantProfit || 0,
          userProfit: data.userProfit || 0,
          totalReferrals: data.totalReferrals || 0
        });
      } else if (userRole === 'Tenant') {
        // Initialize stats if missing and user is Tenant
        setDoc(docSnapshot.ref, {
          tenantProfit: 0,
          userProfit: 0,
          totalReferrals: 0
        }, { merge: true }).catch(e => console.error('Failed to init stats', e));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsubscribe();
  }, [user, userRole]);

  const handleLogin = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setActiveTab('activation');
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setActiveTab('map');
    } catch (err) {
      console.error('Logout error:', err);
    }
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
      console.error('Failed to fetch suggestions', err);
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
      console.error('Face detection models failed to load', e);
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

  const autofillLocation = () => {
    if (position) {
      setProfileData({ ...profileData, location: `${position[0].toFixed(5)}, ${position[1].toFixed(5)}` });
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
          console.error('Error updating logo:', err);
          setError('Failed to update profile logo.');
        }
      };
      reader.readAsDataURL(file);
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
                <button type="button" onClick={() => {setSearchQuery(''); setSuggestions([]); setShowSuggestions(false);}} className="p-2 text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={isSearching}
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
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Map View */}
        <div className={`absolute inset-0 transition-opacity duration-300 ${activeTab === 'map' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <MapContainer
            center={position || [0, 0]}
            zoom={position ? 15 : 2}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            {isSatellite ? <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" /> : <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />}
            <div className="absolute bottom-16 right-4 z-[1000] flex flex-col gap-2 pointer-events-auto">
              <ZoomControls isSatellite={isSatellite} setIsSatellite={setIsSatellite} />
              <button
                onClick={() => requestLocation(false)}
                disabled={isLocating}
                className="p-3 bg-white text-black rounded-xl shadow-xl border border-gray-100 flex items-center justify-center"
              >
                {isLocating ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Compass className="w-5 h-5" />}
              </button>
              <button
                onClick={() => {
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
                  html: `<div class="w-10 h-10 rounded-full border-4 border-blue-500 shadow-lg overflow-hidden ${gigs.some(g => g.userId === user?.uid) ? 'border-emerald-500 ring-2 ring-emerald-300' : ''}">
                    <img src="${selfieImage || ''}" class="w-full h-full object-cover" />
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
            {gigs.map(gig => (
              <Marker 
                key={gig.id} 
                position={[gig.location[0], gig.location[1]]}
                icon={L.divIcon({
                  className: 'bg-transparent',
                  html: `
                    <div class="relative w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden ring-2 ring-blue-500 animate-pulse">
                      <img src="${selfieImage || ''}" class="w-full h-full object-cover" />
                    </div>
                  `,
                  iconSize: [40, 40],
                  iconAnchor: [20, 20]
                })}
              >
                <Popup className="rounded-2xl shadow-xl">
                  <div className="p-2 space-y-2">
                    <h3 className="font-black text-lg">{gig.description}</h3>
                    <p><strong>Budget:</strong> R{gig.budget}</p>
                    <p><strong>Contact:</strong> {gig.contactNumber}</p>
                    <button 
                      onClick={() => setSelectedGigView(gig)}
                      className="w-full py-2 bg-black text-white font-bold rounded-lg text-sm"
                    >
                      View Details
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Activation View */}
        <div className={`absolute inset-0 bg-gray-50 z-20 transition-transform duration-300 flex flex-col p-4 pt-6 ${activeTab === 'activation' ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="max-w-md mx-auto w-full flex-1 flex flex-col gap-6 overflow-y-auto pb-10 no-scrollbar">
            {verificationStep === null ? (
              <>
                <div className="text-center py-4">
                  <h2 className="text-3xl font-black text-black tracking-tight">TimeGiG Pro</h2>
                  <p className="text-gray-500 text-sm font-medium mt-1">Unlock premium location features</p>
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
                    <p className="text-sm text-gray-600 mb-6 font-medium">Earn passive monthly income from user subscriptions while keeping your account active.</p>
                    <button onClick={() => startVerification('Tenant Sub')} className="w-full py-4 bg-black text-white font-bold rounded-2xl active:scale-95 transition-all text-sm">Activate Tenant Sub</button>
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
                    <button onClick={() => startVerification('User Sub')} className="w-full py-4 bg-white text-black font-bold rounded-2xl active:scale-95 transition-all text-sm">Activate User Sub</button>
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
                        {selfieImage ? (
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
                        {idDocument ? (
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
                        <CreditCard className="w-10 h-10" />
                      </div>
                      <h3 className="text-2xl font-black text-black mb-2">Proof of Payment</h3>
                      <p className="text-gray-500 text-sm mb-10 leading-relaxed">Upload the proof of payment for your {selectedPlan} activation.</p>
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
                        {popDocument ? (
                          <img src={popDocument} className="w-full h-full object-cover" alt="POP Preview" />
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-gray-300 mb-2 group-hover:text-emerald-400" />
                            <span className="text-xs font-bold text-gray-400 group-hover:text-emerald-500 uppercase tracking-widest">Upload Proof of Payment</span>
                          </>
                        )}
                      </label>
                      <button 
                        onClick={async () => {
                          if (popDocument && selfieImage && idDocument && user) {
                            try {
                              const vRef = collection(db, 'verifications');
                              await addDoc(vRef, {
                                userId: user.uid,
                                userName: profileData.name && profileData.surname ? `${profileData.name} ${profileData.surname}` : (user.displayName || 'Applicant'),
                                type: selectedPlan?.includes('Tenant') ? 'Tenant' : 'User',
                                selfie: selfieImage,
                                idDoc: idDocument,
                                pop: popDocument,
                                status: 'pending',
                                plan: selectedPlan,
                                createdAt: serverTimestamp()
                              });
                              setVerificationStep('pending');
                            } catch (err) {
                              console.error('Submission error:', err);
                              setError('Failed to submit. Please try again.');
                            }
                          } else if (!user) {
                            setError('You must be logged in to submit.');
                            setActiveTab('auth');
                          }
                        }} 
                        disabled={!popDocument}
                        className={`w-full py-5 font-bold rounded-2xl active:scale-95 transition-all shadow-lg uppercase tracking-widest text-sm ${popDocument ? 'bg-emerald-600 text-white shadow-emerald-100' : 'bg-gray-100 text-gray-400'}`}
                      >
                        Submit Everything
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
                      <button onClick={() => { setVerificationStep(null); setActiveTab('map'); }} className="w-full py-4 text-black font-bold border-2 border-black rounded-2xl active:scale-95 transition-all">Go to Map</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tenant Dashboard View */}
        <div className={`absolute inset-0 bg-gray-50 z-30 transition-transform duration-300 flex flex-col overflow-hidden ${activeTab === 'tenant' ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="flex-1 flex flex-col p-6 pt-12 overflow-y-auto no-scrollbar">
            {!showReferralList ? (
              <div className="max-w-md mx-auto w-full space-y-6 pb-20">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-black text-black tracking-tight mb-1">Tenant Dashboard</h2>
                  <p className="text-gray-500 text-sm font-medium">Passive Income & Network Management</p>
                </div>
                <div className="bg-black rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6">
                    <LayoutGrid className="w-12 h-12 text-white/10 group-hover:text-white/20 transition-all duration-700 rotate-12 group-hover:rotate-0" />
                  </div>
                  <span className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 block">Total Profit Balance</span>
                  <div className="text-5xl font-black text-white tracking-tighter mb-8">R{((profileData as any).tenantProfit || 0).toFixed(2)}</div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                      <span className="text-gray-500 text-[9px] font-black uppercase tracking-widest mb-1 block">Referral Profit</span>
                      <span className="text-2xl font-black text-emerald-400">R{((profileData as any).tenantProfit || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                {/* Referral Link Section */}
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 space-y-4">
                  <div>
                    <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1 block">Your Referral Link</span>
                    <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <input 
                        readOnly 
                        value={`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`} 
                        className="flex-1 bg-transparent text-black text-sm outline-none"
                      />
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?ref=${user?.uid}`);
                        }}
                        className="p-2 text-black hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Link2 className="w-5 h-5" />
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
                <button 
                  onClick={() => setShowReferralList(true)}
                  className="w-full bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex items-center justify-between group active:scale-95 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Users className="w-7 h-7" />
                    </div>
                    <div className="text-left">
                      <h4 className="font-black text-black text-lg">Total Referrals</h4>
                      <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">{referrals.length} Applications Pending</p>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center group-hover:translate-x-1 transition-transform">
                    <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />
                  </div>
                </button>
              </div>
            ) : referralView ? (
              <div className="max-w-md mx-auto w-full flex-1 flex flex-col pb-20 animate-in fade-in slide-in-from-right-4 duration-300">
                <button onClick={() => setReferralView(null)} className="flex items-center gap-2 text-gray-500 font-bold uppercase tracking-widest text-[10px] mb-6 active:scale-95 transition-all">
                  <ChevronLeft className="w-4 h-4" /> Back to List
                </button>
                <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-xl border border-gray-100">
                  <div className="p-8 border-b border-gray-50 flex items-center gap-6">
                    <img src={referralView.selfie} className="w-20 h-20 rounded-2xl object-cover shadow-lg border-2 border-white" alt="Selfie" />
                    <div>
                      <h3 className="text-2xl font-black text-black mb-1">{referralView.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${referralView.type === 'Tenant' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>
                          {referralView.type} Application
                        </span>
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">{referralView.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-8 space-y-8">
                    <div className="space-y-3">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><FileText className="w-3 h-3" /> ID / Passport Document</span>
                      <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-gray-100 bg-gray-50">
                        <img src={referralView.idDoc} className="w-full h-full object-cover" alt="ID Doc" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><CreditCard className="w-3 h-3" /> Proof of Payment</span>
                      <div className="aspect-[16/9] rounded-2xl overflow-hidden border border-gray-100 bg-gray-50">
                        <img src={referralView.pop} className="w-full h-full object-cover" alt="POP" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-4">
                      <button 
                        onClick={async () => { 
                          try {
                            await updateDoc(doc(db, 'verifications', referralView.id), { status: 'rejected' });
                            setReferralView(null);
                          } catch (err) { console.error(err); }
                        }} 
                        className="py-4 bg-red-50 text-red-600 font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-red-100"
                      >
                        <Trash2 className="w-4 h-4" /> Reject
                      </button>
                      <button 
                        onClick={async () => { 
                          try {
                            // Find the userId from the verification
                            const vDoc = await getDoc(doc(db, 'verifications', referralView.id));
                            if (vDoc.exists()) {
                              const vData = vDoc.data();
                              const targetUserId = vData.userId;
                              const targetRole = vData.type;
                              
                              // Update user profile
                              await updateDoc(doc(db, 'users', targetUserId), {
                                isApproved: true,
                                role: targetRole,
                                photoURL: vData.selfie // Use verified selfie as profile logo
                              });
                              
                              // Mark verification as approved
                              await updateDoc(doc(db, 'verifications', referralView.id), { 
                                status: 'approved',
                                isViewed: true 
                              });
                              
                              // Credit tenant profit directly to tenant profile
                              if (user) {
                                const tenantDocRef = doc(db, 'users', user.uid);
                                const tenantDoc = await getDoc(tenantDocRef);
                                const profit = 100; // Standard referral subscription profit
                                if (tenantDoc.exists()) {
                                  const currentTenantProfit = tenantDoc.data().tenantProfit || 0;
                                  await updateDoc(tenantDocRef, {
                                    tenantProfit: currentTenantProfit + profit
                                  });
                                  setProfileData(prev => ({
                                    ...prev,
                                    tenantProfit: currentTenantProfit + profit
                                  }));
                                }
                              }
                            }
                            setReferralView(null);
                          } catch (err) { console.error(err); }
                        }} 
                        className="py-4 bg-black text-white font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/20"
                      >
                        <Check className="w-4 h-4" /> Approve
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
                  <h3 className="text-2xl font-black text-black mb-6">Pending Review</h3>
                  {referrals.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-200">
                      <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No pending applications</p>
                    </div>
                  ) : referrals.map(ref => (
                    <button 
                      key={ref.id} 
                      onClick={async () => {
                        setReferralView(ref);
                        if (!ref.isViewed) {
                          try {
                            await updateDoc(doc(db, 'verifications', ref.id), { isViewed: true });
                          } catch (err) { console.error(err); }
                        }
                      }} 
                      className={`w-full bg-white p-4 rounded-3xl border flex items-center gap-4 active:scale-[0.98] transition-all hover:border-blue-200 relative overflow-hidden ${!ref.isViewed ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'border-gray-100 shadow-sm'}`}
                    >
                      {!ref.isViewed && (
                        <div className="absolute top-0 right-0 w-8 h-8 bg-blue-500/10 rounded-bl-2xl flex items-center justify-center">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                        </div>
                      )}
                      <img src={ref.selfie} className="w-14 h-14 rounded-2xl object-cover shadow-md" alt="" />
                      <div className="flex-1 text-left">
                        <h4 className="font-black text-black">{ref.name}</h4>
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest ${ref.type === 'Tenant' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>{ref.type}</span>
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
        <div className={`absolute inset-0 bg-gray-50 z-40 transition-transform duration-300 flex flex-col overflow-hidden ${activeTab === 'profile' ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar pb-20">
            {/* Profile Header */}
            <div className="bg-black text-white p-8 pt-24 rounded-b-[3rem] relative overflow-visible">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Target className="w-32 h-32 rotate-12" />
              </div>
              <div className="relative z-10 flex flex-col items-center">
                <button 
                  onClick={handleLogout}
                  className="absolute -top-4 right-0 p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all active:scale-95 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Logout</span>
                </button>
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
                <h2 className="text-2xl font-black mt-16 tracking-tight">
                  {profileData.name || 'New'} {profileData.surname || 'User'}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${isApproved ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                    {isApproved ? 'Verified Account' : 'Pending Approval'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6 max-w-md mx-auto w-full">
              {/* Form Section */}
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</label>
                    <input disabled={profileLocked} value={profileData.name} onChange={e => setProfileData({...profileData, name: e.target.value})} type="text" className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold border-0 focus:ring-2 focus:ring-black transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Surname</label>
                    <input disabled={profileLocked} value={profileData.surname} onChange={e => setProfileData({...profileData, surname: e.target.value})} type="text" className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold border-0 focus:ring-2 focus:ring-black transition-all" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Phone className="w-3 h-3" /> Contact Information</label>
                  <input disabled={profileLocked} value={profileData.contact} onChange={e => setProfileData({...profileData, contact: e.target.value})} type="tel" className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold border-0 focus:ring-2 focus:ring-black transition-all" placeholder="+27 ..." />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Mail className="w-3 h-3" /> Email Address</label>
                  <input disabled={profileLocked} value={profileData.email} onChange={e => setProfileData({...profileData, email: e.target.value})} type="email" className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold border-0 focus:ring-2 focus:ring-black transition-all" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><MapPinned className="w-3 h-3" /> Home Location</label>
                  <div className="flex gap-2">
                    <input disabled={profileLocked} value={profileData.location} onChange={e => setProfileData({...profileData, location: e.target.value})} type="text" className="flex-1 bg-gray-50 p-3 rounded-xl text-sm font-bold border-0 focus:ring-2 focus:ring-black transition-all" />
                    {!profileLocked && (
                      <button onClick={autofillLocation} className="p-3 bg-blue-50 text-blue-600 rounded-xl active:scale-95 transition-all"><Globe className="w-5 h-5" /></button>
                    )}
                  </div>
                </div>
              </div>

              {/* Trade & Experience */}
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Briefcase className="w-3 h-3" /> Primary Work Trade</label>
                  <select 
                    disabled={profileLocked} 
                    value={profileData.workTrade} 
                    onChange={e => setProfileData({...profileData, workTrade: e.target.value})}
                    className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold border-0 focus:ring-2 focus:ring-black transition-all"
                  >
                    <option value="">Select a trade...</option>
                    {WORK_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Star className="w-3 h-3" /> Work Experience</label>
                  <textarea disabled={profileLocked} value={profileData.experience} onChange={e => setProfileData({...profileData, experience: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold border-0 focus:ring-2 focus:ring-black min-h-[100px] transition-all" placeholder="Describe your experience..." />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Users className="w-3 h-3" /> Work Reference</label>
                  <textarea disabled={profileLocked} value={profileData.reference} onChange={e => setProfileData({...profileData, reference: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold border-0 focus:ring-2 focus:ring-black min-h-[80px] transition-all" placeholder="Name and contact of reference..." />
                </div>
              </div>

              {/* Social Links */}
              <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Link2 className="w-3 h-3" /> Social Media Links</label>
                  {!profileLocked && (
                    <button onClick={addSocialLink} className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Add More</button>
                  )}
                </div>
                {profileData.socialLinks.map((link, i) => (
                  <input key={i} disabled={profileLocked} value={link} onChange={e => handleSocialLinkChange(i, e.target.value)} type="url" className="w-full bg-gray-50 p-3 rounded-xl text-sm font-bold border-0 focus:ring-2 focus:ring-black transition-all mb-2" placeholder="https://..." />
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
                        } catch (err) { console.error(err); }
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

      {/* Auth View */}
      <div className={`absolute inset-0 bg-white z-[50] transition-transform duration-300 flex flex-col items-center justify-center p-8 ${activeTab === 'auth' ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="w-full max-w-sm flex flex-col items-center text-center space-y-12">
            <div className="relative">
              <div className="w-32 h-32 bg-black rounded-[3rem] rotate-12 flex items-center justify-center shadow-2xl">
                <Target className="w-16 h-16 text-white -rotate-12" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg border-4 border-white">
                <Lock className="w-5 h-5 text-white" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-4xl font-black text-black tracking-tight">TimeGiG</h1>
              <p className="text-gray-500 font-medium">Verify your identity and find local gigs in real-time.</p>
            </div>

            {user ? (
              <div className="w-full space-y-6">
                <div className="bg-gray-50 p-6 rounded-[2.5rem] border border-gray-100 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-black flex items-center justify-center">
                    {user.photoURL ? (
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
                <button onClick={handleLogin} className="w-full py-5 bg-black text-white font-black rounded-2xl shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                  <LogIn className="w-5 h-5" /> SIGN IN WITH GOOGLE
                </button>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Secure authentication via Firebase</p>
              </div>
            )}
          </div>
        </div>

      {/* Bottom Menu Bar */}
      <div className="h-14 bg-white border-t border-gray-100 flex items-center justify-around px-4 z-[3000] shrink-0">
        {!user ? (
           <button onClick={() => { setVerificationStep(null); setActiveTab('auth'); }} className="flex flex-col items-center gap-0.5 text-black transition-all active:scale-90">
             <LogIn className={`w-7 h-7 ${activeTab === 'auth' ? 'stroke-[3]' : 'stroke-[2]'}`} />
             <span className="text-[9px] font-bold uppercase tracking-[0.1em]">Sign-In</span>
           </button>
        ) : (
          <>
            {userRole === 'Tenant' && (
              <button onClick={() => { setVerificationStep(null); setActiveTab('tenant'); setShowReferralList(false); setReferralView(null); }} className="flex flex-col items-center gap-0.5 text-black transition-all active:scale-90">
                <LayoutGrid className={`w-5 h-5 ${activeTab === 'tenant' ? 'stroke-[3]' : 'stroke-[2]'}`} />
                <span className="text-[9px] font-bold uppercase tracking-[0.1em]">Tenant</span>
              </button>
            )}
    
            <button onClick={() => { setActiveTab('map'); setVerificationStep(null); }} className="flex flex-col items-center gap-0.5 text-black transition-all active:scale-90">
              <LocateFixed className={`w-7 h-7 ${activeTab === 'map' ? 'stroke-[3]' : 'stroke-[2]'}`} />
              <span className="text-[9px] font-bold uppercase tracking-[0.1em]">GiGs</span>
            </button>
    
            {!isApproved && !profileData.name && (
              <button onClick={() => { setVerificationStep(null); setActiveTab('activation'); }} className="flex flex-col items-center gap-0.5 text-black transition-all active:scale-90">
                <Zap className={`w-5 h-5 ${activeTab === 'activation' ? 'fill-black stroke-[2]' : 'stroke-[2]'}`} />
                <span className="text-[9px] font-bold uppercase tracking-[0.1em]">Activation</span>
              </button>
            )}
    
            {isApproved && userRole === 'User' && (
              <button onClick={() => { setVerificationStep(null); setActiveTab('tenant'); }} className="flex flex-col items-center gap-0.5 text-black transition-all active:scale-90">
                <Users className={`w-5 h-5 ${activeTab === 'tenant' ? 'stroke-[3]' : 'stroke-[2]'}`} />
                <span className="text-[9px] font-bold uppercase tracking-[0.1em]">Seekers</span>
              </button>
            )}
    
            <button onClick={() => { setVerificationStep(null); setActiveTab('profile'); }} className="flex flex-col items-center gap-0.5 text-black transition-all active:scale-90">
              {selfieImage ? (
                <img src={selfieImage} alt="Profile" className={`w-6 h-6 rounded-full object-cover ${activeTab === 'profile' ? 'border-2 border-black' : 'border border-gray-300'}`} />
              ) : (
                <User className={`w-5 h-5 ${activeTab === 'profile' ? 'stroke-[3]' : 'stroke-[2]'}`} />
              )}
              <span className="text-[9px] font-bold uppercase tracking-[0.1em]">Profile</span>
            </button>
          </>
        )}
      </div>

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 z-[5000] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-xs w-full text-center">
            <p className="text-sm font-bold text-black mb-4">{error}</p>
            <button onClick={() => setError(null)} className="w-full py-3 bg-black text-white font-bold rounded-xl text-xs uppercase tracking-widest">Close</button>
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
            <input type="text" placeholder="Description" className="w-full p-4 border rounded-xl" id="gig-desc" defaultValue={showGigForm !== true ? showGigForm.description : ''} />
            <div className="relative w-full">
              <input 
                type="text" 
                placeholder="Type location address..." 
                className="w-full p-4 border rounded-xl" 
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
            <input type="number" placeholder="Budget" className="w-full p-4 border rounded-xl" id="gig-budget" defaultValue={showGigForm !== true ? showGigForm.budget : ''} />
            <input type="text" placeholder="Contact Number" className="w-full p-4 border rounded-xl" id="gig-contact" defaultValue={showGigForm !== true ? showGigForm.contactNumber : ''} />
            <div className="flex gap-4">
              <input type="date" className="flex-1 p-4 border rounded-xl" id="gig-date" defaultValue={showGigForm !== true ? showGigForm.date : ''} />
              <input type="time" className="flex-1 p-4 border rounded-xl" id="gig-time" defaultValue={showGigForm !== true ? showGigForm.time : ''} />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" id="gig-immediate" defaultChecked={showGigForm !== true ? showGigForm.isImmediate : false} /> Immediate Assistance
            </label>
            <input type="text" placeholder="Experience Needed" className="w-full p-4 border rounded-xl" id="gig-exp" defaultValue={showGigForm !== true ? showGigForm.experienceNeeded : ''} />
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
                  const gigData = {
                    userId: user?.uid,
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
                  console.error(err);
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
          <h2 className="text-3xl font-black mb-4">Gig Details</h2>
          <p className="text-lg mb-2"><strong>Description:</strong> {selectedGigView.description}</p>
          <p className="text-lg mb-2"><strong>Budget:</strong> R{selectedGigView.budget}</p>
          <p className="text-lg mb-2"><strong>Contact:</strong> {selectedGigView.contactNumber}</p>
          <p className="text-lg mb-2"><strong>Date/Time:</strong> {selectedGigView.date} {selectedGigView.time}</p>
          <p className="text-lg mb-4"><strong>Experience Needed:</strong> {selectedGigView.experienceNeeded}</p>
          <button 
            disabled={isApplying || (profileData.applicationChances || 5) <= 0}
            onClick={async () => {
              if (!user) { alert('Please login to apply.'); return; }
              setIsApplying(true);
              const appId = doc(collection(db, 'applications')).id;
              await setDoc(doc(db, 'applications', appId), {
                gigId: selectedGigView.id,
                userId: user.uid,
                status: 'pending',
                createdAt: serverTimestamp()
              });
              await updateDoc(doc(db, 'users', user.uid), {
                applicationChances: (profileData.applicationChances || 5) - 1
              });
              setProfileData(prev => ({...prev, applicationChances: (prev.applicationChances || 5) - 1}));

              let timeout = setTimeout(() => {
                setIsApplying(false);
                alert('Application timed out. Owner did not respond.');
                unsubscribe();
              }, 60000);

              const unsubscribe = onSnapshot(doc(db, 'applications', appId), (doc) => {
                const data = doc.data();
                if (data?.status === 'accepted') {
                  clearTimeout(timeout);
                  unsubscribe();
                  setIsApplying(false);
                  setSelectedGigView(null);
                  setPosition(selectedGigView.location); // Navigate to location
                } else if (data?.status === 'rejected') {
                  clearTimeout(timeout);
                  unsubscribe();
                  setIsApplying(false);
                  alert('Application rejected.');
                }
              });
            }}
            className="w-full py-4 bg-black text-white font-bold rounded-2xl mb-4 disabled:opacity-50"
          >
            {isApplying ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Applying...
              </div>
            ) : `Apply for Gig (${profileData.applicationChances || 5} chances left)`}
          </button>
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
                            console.error(err);
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
