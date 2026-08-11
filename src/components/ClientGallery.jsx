import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Lightbox, { useLightboxState } from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import { Zoom, Thumbnails } from 'yet-another-react-lightbox/plugins';
import 'yet-another-react-lightbox/plugins/thumbnails.css';
import { getAppServices } from '../core/bootstrap/appBootstrap';
import { increment } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import Masonry from 'react-masonry-css';
import { CheckCircle2, ChevronDown, ChevronUp, Download, Heart, Instagram, Loader2, LockKeyhole, MessageCircle, Send, Share2 } from 'lucide-react';
import { trackEvent } from '../services/analytics';
import {
  buildVisibleFolderSections,
  orderPhotosByFolders,
  visibleCountForFolder,
} from '../modules/galleries/client-folder-flow';
import { centerTabHorizontally } from '../modules/galleries/horizontal-tab-scroll';
import {
  getLightboxWindowKeys,
  partitionLightboxUrls,
} from '../modules/galleries/lightbox-memory-window';

const VALID_THEMES = ['minimal'];
const BATCH_SIZE = 24;
const INITIAL_VISIBLE = 24;
const SELECTION_NAME_STORAGE_KEY = 'mina_nume_client';
const LEGACY_SELECTION_NAME_STORAGE_KEY = 'fotolio_nume_client';
const GALLERY_UNLOCK_STORAGE_KEY_PREFIX = 'mina_gallery_unlock_';
const LIGHTBOX_PRELOAD_OFFSETS_DESKTOP = [0, -1, 1];
const LIGHTBOX_PRELOAD_OFFSETS_MOBILE = [0, -1, 1];
const MAX_URL_CACHE_ENTRIES = 400;
const DEFAULT_FOLDER_ID = 'default';
const DEFAULT_FOLDER_NAME = 'Galeria mea';
const DEFAULT_SELECTION_LIST_ID = 'default';
const DEFAULT_SELECTION_LIST_NAME = 'Favorite';

const urlCache = new Map();
const { galleries: galleriesService, media: mediaService, sites: sitesService } = getAppServices();

function isBlobUrl(value) {
  return typeof value === 'string' && value.startsWith('blob:');
}

function getCachedUrl(key) {
  return urlCache.get(key) || null;
}

function cacheUrl(key, value) {
  if (!key || !value) return;
  if (!urlCache.has(key)) {
    urlCache.set(key, value);
  } else {
    const existing = urlCache.get(key);
    if (existing === value) return;
    urlCache.set(key, value);
  }

  if (urlCache.size <= MAX_URL_CACHE_ENTRIES) return;

  const oldestKey = urlCache.keys().next().value;
  if (!oldestKey || oldestKey === key) return;
  // Keep eviction cheap and avoid revoking URLs that can still be used by mounted images.
  urlCache.delete(oldestKey);
}

function clearAllCachedUrls() {
  for (const value of urlCache.values()) {
    if (isBlobUrl(value)) {
      try {
        URL.revokeObjectURL(value);
      } catch (_) {}
    }
  }
  urlCache.clear();
}

function readStoredSelectionName() {
  const current = localStorage.getItem(SELECTION_NAME_STORAGE_KEY);
  if (current) return current;
  return localStorage.getItem(LEGACY_SELECTION_NAME_STORAGE_KEY) || '';
}

function persistSelectionName(name) {
  localStorage.setItem(SELECTION_NAME_STORAGE_KEY, name);
  // Keep writing legacy key too so old clients stay compatible.
  localStorage.setItem(LEGACY_SELECTION_NAME_STORAGE_KEY, name);
}

function clearStoredSelectionName() {
  localStorage.removeItem(SELECTION_NAME_STORAGE_KEY);
  localStorage.removeItem(LEGACY_SELECTION_NAME_STORAGE_KEY);
}

function getGalleryUnlockStorageKey(galleryId) {
  return `${GALLERY_UNLOCK_STORAGE_KEY_PREFIX}${galleryId || ''}`;
}

function sanitizeSelectionKeys(keys = []) {
  if (!Array.isArray(keys)) return [];
  return Array.from(new Set(keys.filter((key) => typeof key === 'string' && key.trim())));
}

function sanitizeSelectionListName(name = '') {
  const normalized = String(name || '').trim().slice(0, 80);
  return normalized || DEFAULT_SELECTION_LIST_NAME;
}

function buildSelectionListId(name = '') {
  const slug = sanitizeSelectionListName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const unique = Date.now().toString(36);
  return slug ? `list_${slug}_${unique}` : `list_${unique}`;
}

function aggregateSelectionKeys(lists = []) {
  return sanitizeSelectionKeys(
    lists.flatMap((list) => sanitizeSelectionKeys(list?.keys || []))
  );
}

function normalizeSelectionLists(lists = [], fallbackKeys = []) {
  const seenIds = new Set();
  const normalized = (Array.isArray(lists) ? lists : [])
    .map((list, index) => {
      const name = sanitizeSelectionListName(list?.name || '');
      let id = String(list?.id || '').trim().slice(0, 120);
      if (!id) {
        id = index === 0 ? DEFAULT_SELECTION_LIST_ID : buildSelectionListId(name);
      }
      while (seenIds.has(id)) {
        id = `${id}_${seenIds.size + 1}`;
      }
      seenIds.add(id);
      return {
        id,
        name,
        keys: sanitizeSelectionKeys(list?.keys || []),
      };
    });

  if (normalized.length > 0) return normalized;

  return [{
    id: DEFAULT_SELECTION_LIST_ID,
    name: DEFAULT_SELECTION_LIST_NAME,
    keys: sanitizeSelectionKeys(fallbackKeys),
  }];
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

async function downloadOriginalImage(pozaKey, filename) {
  const blob = await mediaService.getPhotoBlob(pozaKey, 'original');
  const safeName = filename || pozaKey.split('/').pop() || 'image';

  const blobUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = safeName.includes('.') ? safeName : `${safeName}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function LazyGalleryImage({
  pozaKey,
  isFav,
  onFavoriteClick,
  onClick,
  accentColor,
  allowPhotoSelection = true,
  allowOriginalDownloads = true,
  watermarkEnabled = false,
  watermarkLabel = 'Mina',
  quality = 'thumb',
  favoritePicker = null,
  isTouchLayout = false,
  touchActionsOpen = false,
  onTouchReveal,
}) {
  const [url, setUrl] = useState(() => getCachedUrl(`${quality}:${pozaKey}`) || null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [naturalRatio, setNaturalRatio] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef(null);

  // Reset when quality changes (e.g. user switches grid mode while component stays mounted).
  useEffect(() => {
    setUrl(getCachedUrl(`${quality}:${pozaKey}`) || null);
    setNaturalRatio(null);
    setIsLoaded(false);
    setRetryCount(0);
  }, [quality, pozaKey]);

  // Covers the case where the browser resolves the image synchronously from
  // cache before React attaches onLoad — in that case onLoad never fires.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setNaturalRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
      setIsLoaded(true);
    }
  }, [url]);

  useEffect(() => {
    if (url) return;
    let cancelled = false;

    const cachedUrl = getCachedUrl(`${quality}:${pozaKey}`);
    if (cachedUrl) {
      setUrl(cachedUrl);
      return () => { cancelled = true; };
    }

    const loadUrl = async () => {
      try {
        const loaded = await mediaService.getPhotoUrl(pozaKey, quality);
        if (cancelled) return;
        cacheUrl(`${quality}:${pozaKey}`, loaded);
        setUrl(loaded);
        setRetryCount(0);
      } catch (_) {
        // Keep placeholder when URL is unavailable.
      }
    };

    loadUrl();
    return () => { cancelled = true; };
  }, [pozaKey, quality, url]);

  const handleImgLoad = useCallback((e) => {
    const { naturalWidth: w, naturalHeight: h } = e.target;
    if (w && h) setNaturalRatio(`${w} / ${h}`);
    setIsLoaded(true);
  }, []);

  const handleThumbError = useCallback(() => {
    if (!url) return;
    if (retryCount >= 2) return;
    const cKey = `${quality}:${pozaKey}`;
    if (getCachedUrl(cKey) === url) {
      urlCache.delete(cKey);
    }
    setIsLoaded(false);
    setRetryCount((prev) => prev + 1);
    setUrl(null);
  }, [pozaKey, quality, retryCount, url]);

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadOriginalImage(pozaKey, pozaKey.split('/').pop());
    } catch (e) {
      console.error(e);
    } finally {
      setIsDownloading(false);
    }
  }, [pozaKey, isDownloading]);

  const handleImageClick = useCallback((event) => {
    if (isTouchLayout && !touchActionsOpen) {
      event.preventDefault();
      event.stopPropagation();
      onTouchReveal?.(pozaKey);
      return;
    }

    onTouchReveal?.(null);
    onClick?.();
  }, [isTouchLayout, onClick, onTouchReveal, pozaKey, touchActionsOpen]);

  return (
    <div className="cg-item" style={{ aspectRatio: naturalRatio || '3 / 4' }}>
      <div className={`cg-item-inner ${isLoaded ? 'cg-item-inner--loaded' : 'cg-item-inner--loading'}`}>
        {url && (
          <img
            ref={imgRef}
            src={url}
            alt=""
            className={`cg-item-img ${isLoaded ? 'cg-item-img--loaded' : ''}`}
            loading="lazy"
            onClick={handleImageClick}
            onLoad={handleImgLoad}
            onError={handleThumbError}
          />
        )}
        {!isLoaded && <div className="cg-item-placeholder" aria-hidden="true" />}
        {watermarkEnabled && (
          <div className="cg-watermark" aria-hidden="true">
            {watermarkLabel}
          </div>
        )}
        <div className={`cg-item-overlay ${isFav ? 'cg-item-overlay--selected' : ''} ${favoritePicker?.isOpen ? 'cg-item-overlay--open' : ''} ${touchActionsOpen ? 'cg-item-overlay--touch-open' : ''}`}>
          <div className="cg-item-actions">
            {allowPhotoSelection && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFavoriteClick(pozaKey, 'grid'); }}
                className={`cg-action-btn cg-action-btn--favorite ${isFav ? 'cg-action-btn--active' : ''}`}
                aria-label={isFav ? 'Elimină din selecție' : 'Adaugă la selecție'}
                style={{ color: isFav ? (accentColor || '#b8965a') : 'rgba(255,255,255,0.9)' }}
              >
                <Heart size={20} fill={isFav ? (accentColor || '#b8965a') : 'none'} strokeWidth={1.5} />
              </button>
            )}
            {allowOriginalDownloads && (
              <button
                type="button"
                className="cg-action-btn"
                aria-label="Download"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownload(); }}
                disabled={isDownloading}
              >
                {isDownloading ? <Loader2 size={20} strokeWidth={1.5} style={{ animation: 'cg-spin 0.8s linear infinite' }} /> : <Download size={20} strokeWidth={1.5} />}
              </button>
            )}
          </div>
          {favoritePicker?.isOpen && (
            <FavoriteListPicker
              photoKey={pozaKey}
              className="cg-fav-picker--inline"
              lists={favoritePicker.lists}
              activeListId={favoritePicker.activeListId}
              newListName={favoritePicker.newListName}
              creatingNewList={favoritePicker.creatingNewList}
              inputRef={favoritePicker.inputRef}
              onListClick={favoritePicker.onListClick}
              onCreateNewListClick={favoritePicker.onCreateNewListClick}
              onNewListNameChange={favoritePicker.onNewListNameChange}
              onNewListConfirm={favoritePicker.onNewListConfirm}
              onNewListBlur={favoritePicker.onNewListBlur}
              onNewListCancel={favoritePicker.onNewListCancel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FavoriteListPicker({
  photoKey,
  lists = [],
  activeListId = DEFAULT_SELECTION_LIST_ID,
  newListName = '',
  creatingNewList = false,
  inputRef = null,
  onListClick,
  onCreateNewListClick,
  onNewListNameChange,
  onNewListConfirm,
  onNewListBlur,
  onNewListCancel,
  className = '',
}) {
  return (
    <div
      className={`cg-fav-picker ${className}`.trim()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="cg-fav-picker-list">
        {lists.map((list) => {
          const hasPhoto = Array.isArray(list?.keys) && list.keys.includes(photoKey);
          return (
            <button
              key={list.id}
              type="button"
              className={`cg-fav-picker-item ${hasPhoto ? 'is-active' : ''} ${activeListId === list.id ? 'is-current' : ''}`}
              onClick={() => onListClick?.(list.id)}
            >
              <span className="cg-fav-picker-item-name">{list.name}</span>
              <span className="cg-fav-picker-item-meta">
                {hasPhoto ? 'Selectată' : `${list.keys?.length || 0} poze`}
              </span>
            </button>
          );
        })}
      </div>
      {creatingNewList ? (
        <div className="cg-fav-picker-new">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={newListName}
            placeholder="Nume listă"
            className="cg-fav-picker-input"
            onChange={(event) => onNewListNameChange?.(event.target.value)}
            onBlur={() => onNewListBlur?.()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                onNewListConfirm?.();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onNewListCancel?.();
              }
            }}
          />
        </div>
      ) : (
        <button type="button" className="cg-fav-picker-create" onClick={onCreateNewListClick}>
          + Listă nouă
        </button>
      )}
    </div>
  );
}

const normalizeUrl = (url) => {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (!trimmed) return '#';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/** Parse expiryDate (Firebase Timestamp or ISO string) and return Date or null */
function parseExpiryDate(val) {
  if (val == null) return null;
  if (typeof val?.toDate === 'function') return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/** Returns true if gallery has an expiryDate and current date is strictly past it */
function isGalleryExpired(galleryData) {
  const expiryDate = parseExpiryDate(galleryData?.expiryDate ?? galleryData?.dataExpirare);
  if (!expiryDate) return false;
  return new Date() > expiryDate;
}

function LightboxFavoriteButton({ galerie, pozeAfisate, onFavoriteClick, accentColor }) {
  const { currentIndex } = useLightboxState();
  const poza = pozeAfisate[currentIndex];
  const isFav = poza && galerie?.favorite?.includes(poza.key);
  const heartColor = accentColor || '#b8965a';
  if (!poza) return null;
  return (
    <button
      type="button"
      className="yarl__button"
      onClick={() => onFavoriteClick(poza.key, 'lightbox')}
      aria-label="Favorite"
      style={{ color: isFav ? heartColor : 'rgba(255,255,255,0.75)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Heart size={22} fill={isFav ? heartColor : 'none'} strokeWidth={1.5} />
    </button>
  );
}

function LightboxSelectionCounter({ count = 0, limit = null, selectionTitle = 'Selecție', accentColor }) {
  const limitColor = accentColor || '#b8965a';
  return (
    <div key="lightbox-selection-counter" style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', color: 'rgba(255,255,255,0.9)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", fontWeight: 400, marginRight: 'auto' }}>
      {limit != null ? (
        <span style={{ background: count >= limit ? limitColor : 'rgba(255,255,255,0.12)', padding: '4px 12px', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.15)', fontSize: '13px', fontWeight: 500 }}>
          {count} / {limit}
        </span>
      ) : (
        <span style={{ color: 'rgba(255,255,255,0.65)' }}>{selectionTitle}: <strong style={{ color: '#fff', fontWeight: 500 }}>{count}</strong> poze</span>
      )}
    </div>
  );
}

function LightboxDownloadButton({ pozeAfisate, isDownloading, setDownloading }) {
  const { currentIndex } = useLightboxState();
  const [localDownloading, setLocalDownloading] = useState(false);
  const downloading = isDownloading ?? localDownloading;
  const setDownloadingState = setDownloading ?? setLocalDownloading;
  const poza = pozeAfisate[currentIndex];
  if (!poza) return null;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloadingState(true);
    try {
      await downloadOriginalImage(poza.key, poza.key?.split('/').pop() || poza.nume || 'image');
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingState(false);
    }
  };

  return (
    <button
      type="button"
      className="yarl__button"
      onClick={handleDownload}
      disabled={downloading}
      aria-label="Download"
      style={{ color: 'rgba(255,255,255,0.75)', background: 'none', border: 'none', cursor: downloading ? 'wait' : 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {downloading ? <Loader2 size={22} strokeWidth={1.5} style={{ animation: 'cg-spin 0.8s linear infinite' }} /> : <Download size={22} strokeWidth={1.5} />}
    </button>
  );
}

const ClientGallery = ({ resolvedGalleryId = null }) => {
  const { slug, id: galleryId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);

  useEffect(() => {
    if (!slug && !galleryId && !resolvedGalleryId) { navigate('/', { replace: true }); }
  }, [slug, galleryId, resolvedGalleryId, navigate]);

  const [galerie, setGalerie] = useState(null);
  const [poze, setPoze] = useState([]);
  const [clientFolders, setClientFolders] = useState([]);
  const [activeClientFolderId, setActiveClientFolderId] = useState('all');
  const [coverThumbUrl, setCoverThumbUrl] = useState(null);
  const [coverMediumUrl, setCoverMediumUrl] = useState(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [lightboxMediumUrls, setLightboxMediumUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [eroare, setEroare] = useState(null);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const loadMoreRef = useRef(null);

  const [coverVisible, setCoverVisible] = useState(true);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInputValue, setNameInputValue] = useState('');
  const [emailInputValue, setEmailInputValue] = useState('');
  const [phoneInputValue, setPhoneInputValue] = useState('');
  const [additionalInfoInputValue, setAdditionalInfoInputValue] = useState('');
  const [commentInputValue, setCommentInputValue] = useState('');
  const [selectionTitleInputValue, setSelectionTitleInputValue] = useState('');
  const [pendingFavAction, setPendingFavAction] = useState(null);
  const [selectionLists, setSelectionLists] = useState(() => normalizeSelectionLists());
  const [selectionStatus, setSelectionStatus] = useState('draft');
  const [selectionFinalizedAt, setSelectionFinalizedAt] = useState(null);
  const [showFinalizeSelectionModal, setShowFinalizeSelectionModal] = useState(false);
  const [selectionFinalizing, setSelectionFinalizing] = useState(false);
  const [selectionFinalizeError, setSelectionFinalizeError] = useState('');
  const [activeSelectionListId, setActiveSelectionListId] = useState(DEFAULT_SELECTION_LIST_ID);
  const [favoriteMenuState, setFavoriteMenuState] = useState(null);
  const [creatingFavoriteList, setCreatingFavoriteList] = useState(false);
  const [newFavoriteListName, setNewFavoriteListName] = useState('');
  const [favoriteListMenuId, setFavoriteListMenuId] = useState(null);
  const [editingFavoriteListId, setEditingFavoriteListId] = useState(null);
  const [editingFavoriteListName, setEditingFavoriteListName] = useState('');
  const [activeTouchActionKey, setActiveTouchActionKey] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [lightboxDownloading, setLightboxDownloading] = useState(false);
  const [countPop, setCountPop] = useState(false);
  const [privacyUnlocked, setPrivacyUnlocked] = useState(true);
  const [privacyPasswordInput, setPrivacyPasswordInput] = useState('');
  const [privacyError, setPrivacyError] = useState('');
  const [reviewName, setReviewName] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewNudge, setReviewNudge] = useState(false);

  const [numeSelectie, setNumeSelectie] = useState(() => readStoredSelectionName());
  const [doarFavorite, setDoarFavorite] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [profile, setProfile] = useState({
    brandName: '', logoUrl: '', instagramUrl: '', whatsappNumber: '',
    websiteUrl: '', accentColor: '#b8965a', logoPreviewUrl: null
  });
  const [hasPublicCardProfile, setHasPublicCardProfile] = useState(false);

  const contentRef = useRef(null);
  const reviewSectionRef = useRef(null);
  const newFavoriteListInputRef = useRef(null);
  const newFavoriteListHandledRef = useRef(false);
  const clientFolderSectionRefs = useRef(new Map());
  const clientFolderTabRefs = useRef(new Map());
  const lightboxMediumUrlsRef = useRef({});
  const lightboxOwnedMediumUrlsRef = useRef(new Map());
  const lightboxMediumRequestsRef = useRef(new Map());
  const lightboxKeepKeysRef = useRef(new Set());
  const lightboxOpen = selectedImage !== null;
  const lightboxIndex = selectedImage ?? 0;
  const effectiveActiveClientFolderId = useMemo(() => {
    if (!clientFolders.length) return 'all';
    return clientFolders.some((folder) => folder.id === activeClientFolderId)
      ? activeClientFolderId
      : clientFolders[0].id;
  }, [activeClientFolderId, clientFolders]);
  const pozeOrdonatePeFoldere = useMemo(() => {
    return orderPhotosByFolders(poze, clientFolders);
  }, [clientFolders, poze]);

  const normalizedSelectionLists = useMemo(
    () => normalizeSelectionLists(selectionLists, galerie?.favorite || []),
    [galerie?.favorite, selectionLists]
  );
  const allFavoriteKeys = useMemo(
    () => aggregateSelectionKeys(normalizedSelectionLists),
    [normalizedSelectionLists]
  );
  const allFavoriteKeySet = useMemo(() => new Set(allFavoriteKeys), [allFavoriteKeys]);
  const activeSelectionList = useMemo(() => {
    if (!normalizedSelectionLists.length) return null;
    return normalizedSelectionLists.find((list) => list.id === activeSelectionListId) || normalizedSelectionLists[0];
  }, [activeSelectionListId, normalizedSelectionLists]);
  const activeFavoriteKeys = useMemo(
    () => sanitizeSelectionKeys(activeSelectionList?.keys || []),
    [activeSelectionList]
  );
  const activeFavoriteKeySet = useMemo(() => new Set(activeFavoriteKeys), [activeFavoriteKeys]);

  const pozeAfisate = useMemo(
    () => (galerie
      ? (doarFavorite
          ? pozeOrdonatePeFoldere.filter((p) => activeFavoriteKeySet.has(p.key))
          : pozeOrdonatePeFoldere)
      : []),
    [activeFavoriteKeySet, galerie, doarFavorite, pozeOrdonatePeFoldere]
  );

  const handleClientFolderTabClick = useCallback((folderId) => {
    setActiveClientFolderId(folderId);
    setVisibleCount((current) => visibleCountForFolder({
      photos: pozeAfisate,
      folders: clientFolders,
      folderId,
      current,
      batchSize: BATCH_SIZE,
    }));

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        clientFolderSectionRefs.current.get(folderId)?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
      });
    });
  }, [clientFolders, pozeAfisate]);
  const gallerySettings = galerie?.settings || {};
  const mainSettings = gallerySettings.main || {};
  const favoritesSettings = gallerySettings.favorites || {};
  const reviewsSettings = gallerySettings.reviews || {};
  const contactsSettings = gallerySettings.contacts || {};
  const privacySettings = gallerySettings.privacy || {};

  const allowOriginalDownloads = mainSettings.allowOriginalDownloads !== false;
  const watermarkEnabled = mainSettings.watermarkEnabled === true;
  const allowPhotoSelection = favoritesSettings.allowPhotoSelection !== false;
  const allowReviews = reviewsSettings.allowReviews === true;
  const askReviewAfterDownload = reviewsSettings.askReviewAfterDownload === true;
  const reviewMessage = String(reviewsSettings.reviewMessage || 'Lasă o recenzie dacă ți-au plăcut fotografiile.');
  const showShareButton = contactsSettings.showShareButton !== false;
  const showBusinessCardWidget = contactsSettings.showBusinessCardWidget !== false;
  const showNameWebsiteOnCover = contactsSettings.showNameWebsiteOnCover !== false;
  const isPasswordProtected = privacySettings.passwordProtected === true;
  const watermarkLabel = (profile?.brandName || 'Mina').slice(0, 64);

  const selectionTitle = favoritesSettings.favoritesName || galerie?.numeSelectieClient || 'Selecție';
  const visibleClientName = String(numeSelectie || nameInputValue || '').trim();
  const requiresEmail = favoritesSettings.requireEmail === true;
  const requiresPhone = favoritesSettings.requirePhoneNumber === true;
  const requiresAdditionalInfo = favoritesSettings.requireAdditionalInfo === true;
  const allowSelectionComments = favoritesSettings.allowComments === true;
  const settingsLimitEnabled = favoritesSettings.limitSelectedPhotos === true;
  const settingsMaxSelected = Number(favoritesSettings.maxSelectedPhotos || 0);
  const limit = settingsLimitEnabled && settingsMaxSelected > 0
    ? settingsMaxSelected
    : (galerie?.limitSelectie ?? galerie?.maxSelectie ?? null);
  const selectionLocked = selectionStatus === 'finalized';
  const canEditSelection = allowPhotoSelection && !selectionLocked;
  const applySelectionListsLocally = useCallback((lists, options = {}) => {
    const normalizedLists = normalizeSelectionLists(lists);
    const aggregatedKeys = aggregateSelectionKeys(normalizedLists);
    const preferredActiveId = options.activeListId;
    const nextActiveId = normalizedLists.some((list) => list.id === preferredActiveId)
      ? preferredActiveId
      : (normalizedLists.some((list) => list.id === activeSelectionListId)
          ? activeSelectionListId
          : normalizedLists[0]?.id || DEFAULT_SELECTION_LIST_ID);

    setSelectionLists(normalizedLists);
    setActiveSelectionListId(nextActiveId);
    setGalerie((prev) => (prev ? { ...prev, favorite: aggregatedKeys } : prev));
  }, [activeSelectionListId]);

  const buildClientSelectionMeta = useCallback((latestSelection = null, metaOverride = null) => ({
    clientEmail: String(metaOverride?.clientEmail ?? latestSelection?.clientEmail ?? emailInputValue ?? '').trim(),
    clientPhone: String(metaOverride?.clientPhone ?? latestSelection?.clientPhone ?? phoneInputValue ?? '').trim(),
    clientAdditionalInfo: String(metaOverride?.clientAdditionalInfo ?? latestSelection?.clientAdditionalInfo ?? additionalInfoInputValue ?? '').trim(),
    clientComment: String(metaOverride?.clientComment ?? latestSelection?.clientComment ?? commentInputValue ?? '').trim(),
  }), [additionalInfoInputValue, commentInputValue, emailInputValue, phoneInputValue]);

  const saveSelectionLists = useCallback(async (lists, metaOverride = null, options = {}) => {
    if (!galerie?.id || !numeSelectie) return null;

    const latestSelection = await galleriesService.getClientSelection(galerie.id, numeSelectie).catch(() => null);
    const normalizedLists = normalizeSelectionLists(lists, latestSelection?.keys || []);
    const savedSelection = await galleriesService.saveClientSelectionLists(
      galerie.id,
      numeSelectie,
      normalizedLists,
      selectionTitle,
      buildClientSelectionMeta(latestSelection, metaOverride)
    );
    const resolvedLists = normalizeSelectionLists(savedSelection?.lists || normalizedLists, savedSelection?.keys || []);
    applySelectionListsLocally(resolvedLists, { activeListId: options.activeListId });
    return resolvedLists;
  }, [applySelectionListsLocally, buildClientSelectionMeta, galerie?.id, numeSelectie, selectionTitle]);

  const resetNewFavoriteListFlow = useCallback(() => {
    newFavoriteListHandledRef.current = false;
    setCreatingFavoriteList(false);
    setNewFavoriteListName('');
  }, []);

  const getCurrentNewFavoriteListName = useCallback(() => (
    String(newFavoriteListInputRef.current?.value ?? newFavoriteListName ?? '').trim()
  ), [newFavoriteListName]);

  const closeFavoriteMenus = useCallback(() => {
    setFavoriteMenuState(null);
    resetNewFavoriteListFlow();
    setFavoriteListMenuId(null);
  }, [resetNewFavoriteListFlow]);

  const openFavoriteMenu = useCallback((pozaKey, source = 'grid') => {
    if (!canEditSelection || !pozaKey) return;
    setFavoriteListMenuId(null);
    setEditingFavoriteListId(null);
    setEditingFavoriteListName('');
    resetNewFavoriteListFlow();
    setFavoriteMenuState((prev) => (
      prev?.photoKey === pozaKey && prev?.source === source
        ? null
        : { photoKey: pozaKey, source }
    ));
  }, [canEditSelection, resetNewFavoriteListFlow]);

  const releaseOwnedLightboxUrl = useCallback((photoKey, url) => {
    const ownedUrl = lightboxOwnedMediumUrlsRef.current.get(photoKey);
    if (!ownedUrl || ownedUrl !== url) return;
    lightboxOwnedMediumUrlsRef.current.delete(photoKey);
    if (isBlobUrl(url)) URL.revokeObjectURL(url);
  }, []);

  const setLightboxMemoryWindow = useCallback((centerIndex) => {
    const keepKeys = getLightboxWindowKeys(pozeAfisate, centerIndex, 1);
    lightboxKeepKeysRef.current = keepKeys;

    const { kept, removed } = partitionLightboxUrls(lightboxMediumUrlsRef.current, keepKeys);
    removed.forEach(([photoKey, url]) => releaseOwnedLightboxUrl(photoKey, url));
    lightboxMediumUrlsRef.current = kept;
    setLightboxMediumUrls(kept);
  }, [pozeAfisate, releaseOwnedLightboxUrl]);

  const clearLightboxMemory = useCallback(() => {
    lightboxKeepKeysRef.current = new Set();
    for (const [photoKey, url] of lightboxOwnedMediumUrlsRef.current.entries()) {
      releaseOwnedLightboxUrl(photoKey, url);
    }
    lightboxMediumUrlsRef.current = {};
    setLightboxMediumUrls({});
  }, [releaseOwnedLightboxUrl]);

  const closeLightbox = useCallback(() => {
    clearLightboxMemory();
    setSelectedImage(null);
    setLightboxDownloading(false);
  }, [clearLightboxMemory]);

  const preloadMediumForLightbox = useCallback(async (photoKey) => {
    if (!photoKey) return null;

    const alreadyResolved = lightboxMediumUrlsRef.current[photoKey];
    if (alreadyResolved) return alreadyResolved;

    const cached = getCachedUrl(`medium:${photoKey}`);
    if (cached) {
      if (!lightboxKeepKeysRef.current.has(photoKey)) return cached;
      const next = { ...lightboxMediumUrlsRef.current, [photoKey]: cached };
      lightboxMediumUrlsRef.current = next;
      setLightboxMediumUrls(next);
      return cached;
    }

    const pending = lightboxMediumRequestsRef.current.get(photoKey);
    if (pending) return pending;

    const request = mediaService.getPhotoUrl(photoKey, 'medium')
      .then((medium) => {
        if (!lightboxKeepKeysRef.current.has(photoKey)) {
          if (isBlobUrl(medium)) URL.revokeObjectURL(medium);
          return null;
        }

        lightboxOwnedMediumUrlsRef.current.set(photoKey, medium);
        const next = { ...lightboxMediumUrlsRef.current, [photoKey]: medium };
        lightboxMediumUrlsRef.current = next;
        setLightboxMediumUrls(next);
        return medium;
      })
      .catch(() => null)
      .finally(() => {
        lightboxMediumRequestsRef.current.delete(photoKey);
      });

    lightboxMediumRequestsRef.current.set(photoKey, request);
    return request;
  }, []);
  const seedLightboxSources = useCallback((centerIndex) => {
    if (!Number.isInteger(centerIndex) || centerIndex < 0 || !pozeAfisate.length) return;
    const preloadOffsets = isMobile ? LIGHTBOX_PRELOAD_OFFSETS_MOBILE : LIGHTBOX_PRELOAD_OFFSETS_DESKTOP;
    for (const offset of preloadOffsets) {
      const idx = centerIndex + offset;
      if (idx < 0 || idx >= pozeAfisate.length) continue;
      const key = pozeAfisate[idx]?.key;
      if (!key) continue;
      if (!getCachedUrl(`thumb:${key}`)) {
        mediaService.getPhotoUrl(key, 'thumb').then((url) => cacheUrl(`thumb:${key}`, url)).catch(() => {});
      }
    }
  }, [isMobile, pozeAfisate]);

  const resolveLightboxSrc = useCallback((key) => {
    if (!key) return '';
    if (isMobile) {
      return (
        lightboxMediumUrls[key]
        || getCachedUrl(`medium:${key}`)
        || getCachedUrl(`thumb:${key}`)
        || ''
      );
    }
    return (
      lightboxMediumUrls[key]
      || getCachedUrl(`medium:${key}`)
      || getCachedUrl(`original:${key}`)
      || getCachedUrl(`thumb:${key}`)
      || ''
    );
  }, [isMobile, lightboxMediumUrls]);

  const loadGalleryPhotos = useCallback(async (galleryData) => {
    if (!galleryData?.id) {
      setPoze([]);
      setClientFolders([]);
      setCoverThumbUrl(null);
      setCoverMediumUrl(null);
      return;
    }

    const [pozeRaw, foldersRaw, photoMetadataRaw] = await Promise.all([
      mediaService.listGalleryPhotos(galleryData.id, galleryData.userId),
      galleriesService.getFolders(galleryData.id).catch(() => []),
      galleriesService.listPhotoMetadata(galleryData.id).catch(() => []),
    ]);

    const explicitFolders = (Array.isArray(foldersRaw) ? foldersRaw : [])
      .filter((folder) => folder?.id && folder.id !== DEFAULT_FOLDER_ID);
    const validFolderIds = new Set(explicitFolders.map((folder) => folder.id));
    const photoMetaByKey = new Map(
      (Array.isArray(photoMetadataRaw) ? photoMetadataRaw : [])
        .filter((meta) => meta?.key)
        .map((meta) => [
          meta.key,
          meta.folderId === DEFAULT_FOLDER_ID
            ? DEFAULT_FOLDER_ID
            : (validFolderIds.has(meta.folderId) ? meta.folderId : DEFAULT_FOLDER_ID),
        ])
    );

    const pozeKeys = (Array.isArray(pozeRaw) ? pozeRaw : [])
      .map((p) => {
        const key = p.key || p.Key;
        if (!key) return null;
        return {
          key,
          size: p.size ?? p.Size,
          folderId: photoMetaByKey.get(key) || DEFAULT_FOLDER_ID,
        };
      })
      .filter((p) => p?.key);
    const hasDefaultFolder = pozeKeys.some((photo) => photo.folderId === DEFAULT_FOLDER_ID);
    const nextFolders = hasDefaultFolder
      ? [{ id: DEFAULT_FOLDER_ID, name: DEFAULT_FOLDER_NAME }, ...explicitFolders]
      : explicitFolders;

    setClientFolders(nextFolders);
    setPoze(pozeKeys);
    setActiveClientFolderId((prev) => {
      if (!nextFolders.length) return 'all';
      return nextFolders.some((folder) => folder.id === prev)
        ? prev
        : (nextFolders[0]?.id || 'all');
    });

    if (pozeKeys[0]) {
      const coverKey = pozeKeys[0].key;
      mediaService.getPhotoUrl(coverKey, 'thumb').then((url) => {
        setCoverThumbUrl(url);
        cacheUrl(`thumb:${coverKey}`, url);
      }).catch(() => {});
    } else {
      setCoverThumbUrl(null);
      setCoverMediumUrl(null);
    }
  }, []);

  useEffect(() => {
    const fetchDate = async () => {
      setLoading(true);
      setEroare(null);
      setActiveClientFolderId('all');
      setClientFolders([]);
      setHasPublicCardProfile(false);
      try {
        const effectiveGalleryId = resolvedGalleryId || galleryId
        const dateGal = effectiveGalleryId
          ? await galleriesService.getGalleryById(effectiveGalleryId)
          : await galleriesService.getGalleryBySlug(slug);
        if (!dateGal) {
          setEroare('Galeria nu a fost găsită.');
          setLoading(false);
          return;
        }

        if (dateGal.status === 'trash') throw new Error('Această galerie a fost ștearsă.');
        if (dateGal.statusActiv === false) throw new Error('Această galerie este inactivă.');

        const normalizedGallery = {
          ...dateGal,
          favorite: Array.isArray(dateGal?.favorite) ? dateGal.favorite : [],
        };
        setGalerie(normalizedGallery);

        // Increment view counter once per session per gallery
        const viewKey = `mina_viewed_${normalizedGallery.id}`;
        if (!sessionStorage.getItem(viewKey)) {
          sessionStorage.setItem(viewKey, '1');
          galleriesService.updateGallery(normalizedGallery.id, { vizualizari: increment(1) }).catch(() => {});
        }

        if (normalizedGallery.status === 'archived') {
          setPoze([]);
          setClientFolders([]);
          setCoverThumbUrl(null);
          setCoverMediumUrl(null);
          return;
        }

        if (dateGal.userId) {
          const userId = dateGal.userId;

          // Single fetch sequence for branding + public card availability.
          try {
            const [profileData, cardData] = await Promise.all([
              sitesService.getProfile(userId),
              sitesService.getCardProfile(userId).catch(() => null),
            ]);

            const hasCardData = Boolean(
              cardData
              && [
                cardData.numeBrand,
                cardData.slogan,
                cardData.whatsapp,
                cardData.instagram,
                cardData.email,
                cardData.website,
                cardData.logoUrl,
              ].some((value) => String(value || '').trim().length > 0)
            );
            setHasPublicCardProfile(hasCardData);

            // Apply photographer theme.
            const theme = profileData?.theme;
            if (theme && VALID_THEMES.includes(theme)) {
              document.documentElement.setAttribute('data-theme', theme);
            }

            // Apply branding used inside gallery.
            if (profileData) {
              let logoPreviewUrl = null;
              if (profileData.logoUrl) {
                try { logoPreviewUrl = await mediaService.getBrandingAsset(profileData.logoUrl); } catch (_) {}
              }
              setProfile({
                brandName: profileData.brandName || cardData?.numeBrand || '',
                logoUrl: profileData.logoUrl || cardData?.logoUrl || '',
                instagramUrl: profileData.instagramUrl || cardData?.instagram || '',
                whatsappNumber: profileData.whatsappNumber || cardData?.whatsapp || '',
                websiteUrl: profileData.websiteUrl || cardData?.website || '',
                accentColor: profileData.accentColor || cardData?.accentColor || '#b8965a',
                logoPreviewUrl,
              });
            } else if (cardData) {
              let logoPreviewUrl = null;
              if (cardData.logoUrl) {
                try { logoPreviewUrl = await mediaService.getBrandingAsset(cardData.logoUrl); } catch (_) {}
              }
              setProfile((p) => ({
                ...p,
                brandName: cardData.numeBrand || '',
                logoUrl: cardData.logoUrl || '',
                instagramUrl: cardData.instagram || '',
                whatsappNumber: cardData.whatsapp || '',
                websiteUrl: cardData.website || '',
                accentColor: cardData.accentColor || p.accentColor,
                logoPreviewUrl,
              }));
            } else {
              const legacy = await sitesService.getLegacySettings(userId);
              if (legacy) {
                setProfile((p) => ({
                  ...p,
                  brandName: legacy.numeBrand || p.brandName,
                  instagramUrl: legacy.instagram || '',
                  websiteUrl: legacy.website || '',
                }));
              }
            }
          } catch (e) {
            console.error(e);
            setHasPublicCardProfile(false);
          }
        }

        const needsPassword = normalizedGallery?.settings?.privacy?.passwordProtected === true;

        if (needsPassword) {
          let unlocked = false;
          try {
            const savedToken = sessionStorage.getItem(getGalleryUnlockStorageKey(normalizedGallery.id)) || '';
            if (savedToken) {
              const checkFn = httpsCallable(functions, 'checkGalleryUnlockToken');
              const result = await checkFn({ galleryId: normalizedGallery.id, token: savedToken });
              unlocked = result?.data?.valid === true;
              if (!unlocked) {
                // Token expired or invalid — clear it
                try { sessionStorage.removeItem(getGalleryUnlockStorageKey(normalizedGallery.id)); } catch (_) {}
              }
            }
          } catch (_) {
            unlocked = false;
          }
          setPrivacyUnlocked(unlocked);
          if (!unlocked) {
            setPoze([]);
            setCoverThumbUrl(null);
            setCoverMediumUrl(null);
            setLoading(false);
            return;
          }
        } else {
          setPrivacyUnlocked(true);
        }

        await loadGalleryPhotos(normalizedGallery);
      } catch (err) {
        setEroare(err.message || 'Eroare la încărcare.');
      } finally {
        setLoading(false);
      }
    };

    if (slug || galleryId || resolvedGalleryId) fetchDate();
  }, [slug, galleryId, resolvedGalleryId, loadGalleryPhotos]);

  useEffect(() => {
    if (!galerie?.id) return;

    if (!numeSelectie) {
      applySelectionListsLocally(normalizeSelectionLists([], []), { activeListId: DEFAULT_SELECTION_LIST_ID });
      setSelectionStatus('draft');
      setSelectionFinalizedAt(null);
      setEmailInputValue('');
      setPhoneInputValue('');
      setAdditionalInfoInputValue('');
      setCommentInputValue('');
      return;
    }

    let cancelled = false;

    const loadClientSelection = async () => {
      try {
        const directSelection = await galleriesService.getClientSelection(galerie.id, numeSelectie).catch(() => null);
        const selection = directSelection || await galleriesService.getClientSelectionAccess(galerie.id, numeSelectie).catch(() => null);
        if (cancelled) return;

        const fallbackLegacy = Array.isArray(galerie?.selectii?.[numeSelectie]) ? galerie.selectii[numeSelectie] : [];
        const fallbackCurrent = Array.isArray(galerie?.favorite) ? galerie.favorite : [];
        const fallbackKeys = fallbackLegacy.length > 0 ? fallbackLegacy : fallbackCurrent;
        const lists = normalizeSelectionLists(selection?.lists || [], fallbackKeys);

        applySelectionListsLocally(lists);
        setEmailInputValue(String(selection?.clientEmail || ''));
        setPhoneInputValue(String(selection?.clientPhone || ''));
        setAdditionalInfoInputValue(String(selection?.clientAdditionalInfo || ''));
        setCommentInputValue(String(selection?.clientComment || ''));
        setSelectionStatus(selection?.status === 'finalized' ? 'finalized' : 'draft');
        setSelectionFinalizedAt(selection?.finalizedAt || null);
      } catch (_) {
      }
    };

    loadClientSelection();
    return () => { cancelled = true; };
  }, [applySelectionListsLocally, galerie?.id, numeSelectie]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
    setActiveTouchActionKey(null);
  }, [doarFavorite]);

  useEffect(() => {
    if (!normalizedSelectionLists.some((list) => list.id === activeSelectionListId)) {
      setActiveSelectionListId(normalizedSelectionLists[0]?.id || DEFAULT_SELECTION_LIST_ID);
    }
  }, [activeSelectionListId, normalizedSelectionLists]);

  useEffect(() => {
    if (!favoriteMenuState && !favoriteListMenuId && !editingFavoriteListId) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (creatingFavoriteList) return;
      if (
        target.closest('.cg-fav-picker')
        || target.closest('.cg-action-btn--favorite')
        || target.closest('.cg-favorite-list-menu')
        || target.closest('.cg-favorite-list-menu-toggle')
        || target.closest('.cg-favorite-list-input')
      ) {
        return;
      }

      closeFavoriteMenus();
      setEditingFavoriteListId(null);
      setEditingFavoriteListName('');
    };

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      closeFavoriteMenus();
      setEditingFavoriteListId(null);
      setEditingFavoriteListName('');
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeFavoriteMenus, creatingFavoriteList, editingFavoriteListId, favoriteListMenuId, favoriteMenuState]);

  useEffect(() => {
    if (!clientFolders.length) {
      if (activeClientFolderId !== 'all') setActiveClientFolderId('all');
      return;
    }

    if (!clientFolders.some((folder) => folder.id === activeClientFolderId)) {
      setActiveClientFolderId(clientFolders[0]?.id || 'all');
    }
  }, [activeClientFolderId, clientFolders]);

  useEffect(() => {
    if (!clientFolders.length || coverVisible) return undefined;

    let frameId = null;
    const updateActiveFolderFromScroll = () => {
      frameId = null;
      const activationLine = 76;
      let nextFolderId = clientFolders[0]?.id || 'all';

      for (const folder of clientFolders) {
        const section = clientFolderSectionRefs.current.get(folder.id);
        if (!section) continue;
        if (section.getBoundingClientRect().top <= activationLine) {
          nextFolderId = folder.id;
        } else {
          break;
        }
      }

      setActiveClientFolderId((current) => (current === nextFolderId ? current : nextFolderId));
    };

    const handleScroll = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateActiveFolderFromScroll);
    };

    updateActiveFolderFromScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [clientFolders, coverVisible, doarFavorite, visibleCount]);

  useEffect(() => {
    if (activeClientFolderId === 'all') return;
    const tab = clientFolderTabRefs.current.get(activeClientFolderId);
    const scrollContainer = tab?.closest('.cg-toolbar-left');
    if (!tab || !scrollContainer) return;

    centerTabHorizontally(tab, scrollContainer);
  }, [activeClientFolderId]);

  useEffect(() => {
    const coverKey = poze[0]?.key;
    if (!coverKey || getCachedUrl(`medium:${coverKey}`)) return;
    mediaService.getPhotoUrl(coverKey, 'medium').then((url) => { cacheUrl(`medium:${coverKey}`, url); setCoverMediumUrl(url); }).catch(() => {});
  }, [poze]);

  useEffect(() => {
    if (!galerie?.nume) return;
    document.title = galerie.nume;
  }, [galerie?.nume]);

  useEffect(() => {
    const ownedMediumUrls = lightboxOwnedMediumUrlsRef.current;
    return () => {
      for (const url of ownedMediumUrls.values()) {
        if (isBlobUrl(url)) URL.revokeObjectURL(url);
      }
      ownedMediumUrls.clear();
      lightboxMediumUrlsRef.current = {};
      lightboxKeepKeysRef.current = new Set();
      clearAllCachedUrls();
    };
  }, []);

  useEffect(() => {
    if (!galerie?.id) return;
    setPrivacyPasswordInput('');
    setPrivacyError('');
    setReviewSubmitted(false);
    setReviewText('');
    setReviewName((prev) => prev || readStoredSelectionName() || '');
  }, [galerie?.id]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || pozeAfisate.length === 0) return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, pozeAfisate.length)); }, { rootMargin: '200px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [pozeAfisate.length]);

  useEffect(() => {
    if (!lightboxOpen || !pozeAfisate.length) return;
    setLightboxMemoryWindow(lightboxIndex);
    seedLightboxSources(lightboxIndex);
    const preloadOffsets = isMobile ? LIGHTBOX_PRELOAD_OFFSETS_MOBILE : LIGHTBOX_PRELOAD_OFFSETS_DESKTOP;
    const indices = preloadOffsets
      .map((offset) => lightboxIndex + offset)
      .filter((i) => i >= 0 && i < pozeAfisate.length);
    indices.forEach((i) => {
      const key = pozeAfisate[i].key;
      void preloadMediumForLightbox(key);
    });
  }, [isMobile, lightboxOpen, lightboxIndex, pozeAfisate, preloadMediumForLightbox, seedLightboxSources, setLightboxMemoryWindow]);

  useEffect(() => {
    if (!lightboxOpen) return;
    if (!pozeAfisate.length) {
      closeLightbox();
      return;
    }
    if (lightboxIndex >= pozeAfisate.length) {
      setSelectedImage(pozeAfisate.length - 1);
    }
  }, [lightboxOpen, lightboxIndex, pozeAfisate.length, closeLightbox]);

  useEffect(() => {
    if (!lightboxOpen && favoriteMenuState?.source === 'lightbox') {
      closeFavoriteMenus();
    }
  }, [closeFavoriteMenus, favoriteMenuState, lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return undefined
    const scrollY = window.scrollY
    document.documentElement.style.scrollBehavior = 'auto'
    document.body.dataset.scrollY = scrollY
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.scrollBehavior = ''
      const savedY = parseInt(document.body.dataset.scrollY || '0', 10)
      delete document.body.dataset.scrollY
      window.scrollTo({ top: savedY, behavior: 'instant' })
    }
  }, [lightboxOpen])

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTopButton(window.scrollY > 400);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleEnterGallery = () => {
    setCoverVisible(false);
    setTimeout(() => { contentRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100);
  };

  const handleScrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleShare = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: galerie?.nume, url: window.location.href }); }
      else { await navigator.clipboard.writeText(window.location.href); alert('Link copiat!'); }
    } catch (err) { console.log('Share canceled'); }
  };

  const handleFavoriteClick = (pozaKey, source = 'grid') => {
    if (!canEditSelection) return;
    if (!numeSelectie) {
      setPendingFavAction({ photoKey: pozaKey, source });
      setShowNameModal(true);
      return;
    }
    openFavoriteMenu(pozaKey, source);
  };

  const handleSaveName = async () => {
    if (!nameInputValue.trim()) return;
    if (requiresEmail && !emailInputValue.trim()) {
      alert('Email-ul este obligatoriu pentru această galerie.');
      return;
    }
    if (requiresPhone && !phoneInputValue.trim()) {
      alert('Numărul de telefon este obligatoriu pentru această galerie.');
      return;
    }
    if (requiresAdditionalInfo && !additionalInfoInputValue.trim()) {
      alert('Completează câmpul de informații adiționale.');
      return;
    }
    const cleanName = nameInputValue.trim();
    persistSelectionName(cleanName);
    setNumeSelectie(cleanName);
    setShowNameModal(false);
    const titleToSave = selectionTitleInputValue.trim() || 'Selecție';
    if (!favoritesSettings?.favoritesName && !galerie?.numeSelectieClient && titleToSave) {
      setGalerie(prev => (prev ? { ...prev, numeSelectieClient: titleToSave } : prev));
    }
    setSelectionTitleInputValue('');
    if (pendingFavAction) {
      openFavoriteMenu(pendingFavAction.photoKey, pendingFavAction.source || 'grid');
      setPendingFavAction(null);
    }
  };

  const handleClearClientName = () => {
    clearStoredSelectionName();
    setNumeSelectie('');
    setNameInputValue('');
    setSelectionStatus('draft');
    setSelectionFinalizedAt(null);
    applySelectionListsLocally(normalizeSelectionLists([], []), { activeListId: DEFAULT_SELECTION_LIST_ID });
    closeFavoriteMenus();
  };

  const handleOpenFinalizeSelection = () => {
    if (!numeSelectie || favCount <= 0 || selectionLocked) return;
    setSelectionFinalizeError('');
    setShowFinalizeSelectionModal(true);
  };

  const handleFinalizeSelection = async () => {
    if (!galerie?.id || !numeSelectie || favCount <= 0 || selectionLocked || selectionFinalizing) return;

    setSelectionFinalizing(true);
    setSelectionFinalizeError('');
    try {
      const result = await galleriesService.finalizeClientSelection(galerie.id, numeSelectie);
      setSelectionStatus('finalized');
      setSelectionFinalizedAt(result?.finalizedAt || new Date().toISOString());
      setShowFinalizeSelectionModal(false);
      closeFavoriteMenus();
      trackEvent('selection_completed', { photo_count: favCount });
    } catch (error) {
      console.error(error);
      const message = String(error?.message || 'Selecția nu a putut fi trimisă. Încearcă din nou.')
        .replace(/^Firebase:\s*/i, '')
        .replace(/^functions\/[a-z-]+:\s*/i, '');
      setSelectionFinalizeError(message);
    } finally {
      setSelectionFinalizing(false);
    }
  };

  const executeFavoriteToggle = async (pozaKey, numeClient, metaOverride = null, listId = activeSelectionListId) => {
    if (!canEditSelection || !galerie?.id || !numeClient) return;
    const latestSelection = await galleriesService.getClientSelection(galerie.id, numeClient).catch(() => null);
    const currentLists = normalizeSelectionLists(latestSelection?.lists || normalizedSelectionLists, latestSelection?.keys || allFavoriteKeys);
    const currentFav = aggregateSelectionKeys(currentLists);
    const nextListId = currentLists.some((list) => list.id === listId)
      ? listId
      : (currentLists[0]?.id || DEFAULT_SELECTION_LIST_ID);
    const targetList = currentLists.find((list) => list.id === nextListId) || currentLists[0];
    const targetKeys = sanitizeSelectionKeys(targetList?.keys || []);
    const isFav = targetKeys.includes(pozaKey);
    const clientMeta = buildClientSelectionMeta(latestSelection, metaOverride);
    if (requiresEmail && !clientMeta.clientEmail) {
      setShowNameModal(true);
      return;
    }
    if (requiresPhone && !clientMeta.clientPhone) {
      setShowNameModal(true);
      return;
    }
    if (requiresAdditionalInfo && !clientMeta.clientAdditionalInfo) {
      setShowNameModal(true);
      return;
    }
    try {
      if (isFav) {
        const nextLists = currentLists.map((list) => (
          list.id === nextListId
            ? { ...list, keys: sanitizeSelectionKeys(list.keys.filter((key) => key !== pozaKey)) }
            : list
        ));
        await saveSelectionLists(nextLists, clientMeta, { activeListId: nextListId });
      } else {
        if (limit != null && Number(limit) > 0 && !currentFav.includes(pozaKey) && currentFav.length >= Number(limit)) {
          alert(`Ai atins limita de ${limit} fotografii pentru această selecție.`);
          return;
        }
        const nextLists = currentLists.map((list) => (
          list.id === nextListId
            ? { ...list, keys: sanitizeSelectionKeys([...(list.keys || []), pozaKey]) }
            : list
        ));
        const nextFavoriteKeys = aggregateSelectionKeys(nextLists);
        await saveSelectionLists(nextLists, clientMeta, { activeListId: nextListId });
        if (nextFavoriteKeys.length > currentFav.length) {
          setCountPop(true);
          setTimeout(() => setCountPop(false), 450);
        }
      }
      closeFavoriteMenus();
    } catch (e) { console.error(e); }
  };

  const handleCreateFavoriteList = async (photoKey = favoriteMenuState?.photoKey || null, explicitName = '') => {
    if (!canEditSelection) return;
    const rawName = String(explicitName || getCurrentNewFavoriteListName() || '').trim();
    if (!rawName) {
      resetNewFavoriteListFlow();
      return;
    }
    const cleanName = sanitizeSelectionListName(rawName);

    const nextListId = buildSelectionListId(cleanName);
    const nextKeys = photoKey ? sanitizeSelectionKeys([photoKey]) : [];
    const currentCount = allFavoriteKeys.length;
    const nextLists = [
      ...normalizedSelectionLists,
      { id: nextListId, name: cleanName, keys: nextKeys },
    ];
    const nextFavoriteKeys = aggregateSelectionKeys(nextLists);

    if (limit != null && Number(limit) > 0 && nextFavoriteKeys.length > Number(limit) && !allFavoriteKeySet.has(photoKey)) {
      alert(`Ai atins limita de ${limit} fotografii pentru această selecție.`);
      return;
    }

    try {
      await saveSelectionLists(nextLists, null, { activeListId: nextListId });
      if (nextFavoriteKeys.length > currentCount) {
        setCountPop(true);
        setTimeout(() => setCountPop(false), 450);
      }
      closeFavoriteMenus();
      setActiveSelectionListId(nextListId);
    } catch (error) {
      console.error(error);
    } finally {
      newFavoriteListHandledRef.current = false;
    }
  };

  const handleStartFavoriteListCreation = useCallback(() => {
    if (!canEditSelection) return;
    newFavoriteListHandledRef.current = false;
    setCreatingFavoriteList(true);
    setNewFavoriteListName('');
  }, [canEditSelection]);

  const handleCancelFavoriteListCreation = useCallback(() => {
    newFavoriteListHandledRef.current = true;
    resetNewFavoriteListFlow();
    requestAnimationFrame(() => {
      newFavoriteListHandledRef.current = false;
    });
  }, [resetNewFavoriteListFlow]);

  const handleConfirmFavoriteListCreation = useCallback((photoKey) => {
    if (newFavoriteListHandledRef.current) return;
    newFavoriteListHandledRef.current = true;
    void handleCreateFavoriteList(photoKey);
  }, [handleCreateFavoriteList]);

  const handleBlurFavoriteListCreation = useCallback((photoKey) => {
    if (newFavoriteListHandledRef.current) {
      newFavoriteListHandledRef.current = false;
      return;
    }
    void handleCreateFavoriteList(photoKey);
  }, [handleCreateFavoriteList]);

  const handleStartRenameFavoriteList = (listId) => {
    const list = normalizedSelectionLists.find((item) => item.id === listId);
    if (!list) return;
    setFavoriteListMenuId(null);
    setEditingFavoriteListId(listId);
    setEditingFavoriteListName(list.name);
  };

  const handleRenameFavoriteList = async (listId) => {
    if (!canEditSelection) return;
    const list = normalizedSelectionLists.find((item) => item.id === listId);
    if (!list) return;
    const rawName = String(editingFavoriteListName || '').trim();
    const cleanName = sanitizeSelectionListName(rawName || list.name);

    try {
      await saveSelectionLists(
        normalizedSelectionLists.map((item) => (
          item.id === listId ? { ...item, name: cleanName } : item
        )),
        null,
        { activeListId: listId }
      );
      setEditingFavoriteListId(null);
      setEditingFavoriteListName('');
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteFavoriteList = async (listId) => {
    if (!canEditSelection) return;
    const list = normalizedSelectionLists.find((item) => item.id === listId);
    if (!list) return;
    const confirmed = window.confirm(`Ștergi lista "${list.name}"?`);
    if (!confirmed) return;

    const remainingLists = normalizedSelectionLists.filter((item) => item.id !== listId);
    const nextLists = remainingLists.length > 0
      ? remainingLists
      : normalizeSelectionLists([], []);
    const nextActiveId = nextLists.some((item) => item.id === activeSelectionListId)
      ? activeSelectionListId
      : (nextLists[0]?.id || DEFAULT_SELECTION_LIST_ID);

    try {
      await saveSelectionLists(nextLists, null, { activeListId: nextActiveId });
      setFavoriteListMenuId(null);
      setEditingFavoriteListId(null);
      setEditingFavoriteListName('');
    } catch (error) {
      console.error(error);
    }
  };

  const handleDownload = async () => {
    if (!allowOriginalDownloads) return;
    const targets = doarFavorite ? poze.filter((p) => activeFavoriteKeySet.has(p.key)) : poze;
    if (!window.confirm(`Descarci ${targets.length} fotografii?`)) return;
    setDownloadingAll(true);
    for (const p of targets) {
      try {
        await downloadOriginalImage(p.key, p.key.split('/').pop());
        await new Promise(r => setTimeout(r, 600));
      } catch (e) { console.error(e); }
    }
    setDownloadingAll(false);
    if (allowReviews && askReviewAfterDownload) {
      setReviewNudge(true);
      setTimeout(() => setReviewNudge(false), 1800);
      reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleUnlockGallery = useCallback(async () => {
    if (!galerie?.id || !isPasswordProtected) return;
    const typedPassword = String(privacyPasswordInput || '').trim();
    if (!typedPassword) {
      setPrivacyError('Introdu parola galeriei.');
      return;
    }

    try {
      const verifyFn = httpsCallable(functions, 'verifyGalleryPassword');
      const result = await verifyFn({ galleryId: galerie.id, password: typedPassword });
      const token = result?.data?.token;
      if (!token) {
        setPrivacyError('Parolă incorectă.');
        return;
      }

      try {
        sessionStorage.setItem(getGalleryUnlockStorageKey(galerie.id), token);
      } catch (_) {
      }

      setPrivacyError('');
      setPrivacyUnlocked(true);
      setLoading(true);
      await loadGalleryPhotos(galerie);
    } catch (err) {
      const msg = err?.code === 'functions/permission-denied' ? 'Parolă incorectă.' : 'Nu am putut verifica parola. Încearcă din nou.';
      setPrivacyError(msg);
    } finally {
      setLoading(false);
    }
  }, [galerie, isPasswordProtected, loadGalleryPhotos, privacyPasswordInput]);

  const handleSubmitReview = useCallback(async (event) => {
    event.preventDefault();
    if (!allowReviews || !galerie?.id || reviewSubmitting) return;

    const cleanName = String(reviewName || '').trim();
    const cleanMessage = String(reviewText || '').trim();
    if (!cleanName) {
      alert('Introdu numele tău.');
      return;
    }
    if (!cleanMessage) {
      alert('Scrie mesajul recenziei.');
      return;
    }

    setReviewSubmitting(true);
    try {
      await galleriesService.submitGalleryReview(galerie.id, {
        name: cleanName,
        message: cleanMessage,
      });
      setReviewSubmitted(true);
      setReviewText('');
    } catch (error) {
      console.error(error);
      alert(error?.message || 'Nu am putut salva recenzia.');
    } finally {
      setReviewSubmitting(false);
    }
  }, [allowReviews, galerie?.id, reviewName, reviewSubmitting, reviewText]);

  // Lightbox plugins — no Thumbnails on mobile (they stack vertically and break layout)
  const lightboxPlugins = isMobile ? [Zoom] : [Zoom, Thumbnails];

  if (!slug && !galleryId && !resolvedGalleryId) return null;

  // Loading state
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ margin: '0 0 12px' }}><span style={{
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 300,
  fontSize: '2.2rem',
  letterSpacing: '0.15em',
  color: '#1d1d1f',
  fontStyle: 'normal',
  textDecoration: 'none'
}}>MINA</span></p>
        <p style={{ fontSize: '13px', color: '#a1a1a6', fontWeight: 300 }}>Se încarcă galeria...</p>
      </div>
    );
  }

  if (eroare) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7', fontFamily: "'DM Sans', sans-serif", textAlign: 'center', padding: '40px' }}>
        <p style={{ margin: '0 0 16px' }}><span style={{
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 300,
  fontSize: '2.2rem',
  letterSpacing: '0.15em',
  color: '#1d1d1f',
  fontStyle: 'normal',
  textDecoration: 'none'
}}>MINA</span></p>
        <p style={{ fontSize: '15px', color: '#3a3a3c', fontWeight: 400, margin: '0 0 8px' }}>{eroare}</p>
        <button onClick={() => navigate('/')} style={{ marginTop: '20px', padding: '12px 28px', background: '#1d1d1f', color: '#fff', border: 'none', borderRadius: '100px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}>Acasă</button>
      </div>
    );
  }

  if (!galerie) return null;

  if (isPasswordProtected && !privacyUnlocked) {
    return (
      <div className="cg-root">
        <div className="cg-privacy-shell">
          <div className="cg-privacy-card">
            <p className="cg-privacy-brand"><span style={{
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 300,
  fontSize: '2.2rem',
  letterSpacing: '0.15em',
  color: '#1d1d1f',
  fontStyle: 'normal',
  textDecoration: 'none'
}}>MINA</span></p>
            <h2 className="cg-privacy-title">Galerie protejată</h2>
            <p className="cg-privacy-subtitle">Introdu parola primită de la fotograf pentru a vedea galeria.</p>
            <input
              type="password"
              value={privacyPasswordInput}
              onChange={(e) => {
                setPrivacyPasswordInput(e.target.value);
                if (privacyError) setPrivacyError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleUnlockGallery();
                }
              }}
              className="cg-privacy-input"
              placeholder="Parolă galerie"
              autoFocus
            />
            {privacyError ? <p className="cg-privacy-error">{privacyError}</p> : null}
            <div className="cg-privacy-actions">
              <button type="button" className="cg-privacy-btn cg-privacy-btn--ghost" onClick={() => navigate('/')}>
                Acasă
              </button>
              <button type="button" className="cg-privacy-btn" onClick={handleUnlockGallery}>
                Deschide galeria
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const coverImageUrl = galerie.coverUrl || coverMediumUrl || coverThumbUrl;
  const coverIsBlurred = !galerie.coverUrl && coverThumbUrl && !coverMediumUrl;
  const coverFocalPoint = galerie?.coverFocalPoint;
  const rawGridLayout = galerie?.gridLayout || '4col';
  const gridLayout = rawGridLayout === '2col' ? '4col' : rawGridLayout;
  const coverObjectPosition = (Number.isFinite(Number(coverFocalPoint?.x)) && Number.isFinite(Number(coverFocalPoint?.y)))
    ? Math.max(0, Math.min(100, Number(coverFocalPoint.x))) + '% ' + Math.max(0, Math.min(100, Number(coverFocalPoint.y))) + '%'
    : 'center';
  const pozeVizibile = pozeAfisate.slice(0, visibleCount);
  const clientGallerySections = buildVisibleFolderSections({
    folders: clientFolders,
    allPhotos: pozeAfisate,
    visiblePhotos: pozeVizibile,
    visibleCount,
  });
  const favCount = allFavoriteKeys.length;
  const selectionFinalizedDate = selectionFinalizedAt?.toDate?.() || (selectionFinalizedAt ? new Date(selectionFinalizedAt) : null);
  const selectionFinalizedLabel = selectionFinalizedDate && !Number.isNaN(selectionFinalizedDate.getTime())
    ? selectionFinalizedDate.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const activeClientFolder = clientFolders.find((folder) => folder.id === effectiveActiveClientFolderId) || null;
  const activeClientFolderName = activeClientFolder?.name || '';
  const isArchived = galerie?.status === 'archived';
  const isExpired = isGalleryExpired(galerie);

  if (isArchived) {
    return (
      <div className="cg-root">
        <div className="cg-expired-block">
          <p className="cg-expired-message">Această galerie nu mai este disponibilă.</p>
        </div>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="cg-root">
        <div className="cg-expired-block">
          <p className="cg-expired-message">Această galerie a expirat. Contactează fotograful pentru reactivare.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cg-root">

      {/* ── COVER CINEMATIC ── */}
      <div className={`cg-cover ${!coverVisible ? 'cg-cover--hidden' : ''}`}>
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt=""
            fetchPriority="high"
            className={`cg-cover-img ${coverIsBlurred ? 'cg-cover-img--blurred' : ''}`}
                      style={{ objectPosition: coverObjectPosition }}
          />
        ) : (
          <div className="cg-cover-fallback" />
        )}

        <div className="cg-cover-overlay">
          {/* Brand logo */}
          {showNameWebsiteOnCover && (profile.logoPreviewUrl || profile.brandName) && (
            <div className="cg-cover-brand">
              {profile.logoPreviewUrl ? (
                <img src={profile.logoPreviewUrl} alt={profile.brandName || 'Logo'} className="cg-cover-logo" />
              ) : (
                <span className="cg-cover-brand-name">{profile.brandName}</span>
              )}
            </div>
          )}

          {/* Title */}
          <div className="cg-cover-center">
            <h1 className="cg-cover-title">{galerie.nume}</h1>
            {(galerie.dataEveniment || galerie.data) && (() => {
              const raw = galerie.dataEveniment || galerie.data;
              const d = raw?.toDate ? raw.toDate() : new Date(raw);
              if (isNaN(d.getTime())) return null;
              const formatted = d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
              return <p className="cg-cover-meta" style={{ color: '#fff', marginTop: '10px' }}>{formatted}</p>;
            })()}
            <button onClick={handleEnterGallery} className="cg-cover-btn">
              Deschide galeria
              <ChevronDown size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Photo count */}
          <div className="cg-cover-count">
            {poze.length} fotografii
          </div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div ref={contentRef} className={`cg-main ${coverVisible ? 'cg-main--hidden' : ''}`}>

        <>
        {/* Sticky Toolbar */}
        <div className="cg-toolbar">
          <div className="cg-toolbar-left">
            <div className="cg-toolbar-tabs" role="tablist" aria-label="Foldere galerie">
              {clientFolders.map((folder) => (
                <button
                  key={folder.id}
                  ref={(node) => {
                    if (node) clientFolderTabRefs.current.set(folder.id, node);
                    else clientFolderTabRefs.current.delete(folder.id);
                  }}
                  type="button"
                  className={`cg-tab-all ${effectiveActiveClientFolderId === folder.id ? 'is-active' : ''}`}
                  onClick={() => handleClientFolderTabClick(folder.id)}
                  aria-pressed={effectiveActiveClientFolderId === folder.id}
                >
                  {folder.name}
                </button>
              ))}
            </div>
          </div>

          <div className="cg-toolbar-right">
            {visibleClientName && (
              <div className="cg-client-name-indicator">
                <span>{`Bună, ${visibleClientName}`}</span>
                <button
                  type="button"
                  className="cg-client-name-clear"
                  onClick={handleClearClientName}
                  aria-label="Șterge numele clientului"
                  title="Șterge numele"
                >
                  ✕
                </button>
              </div>
            )}
            {allowPhotoSelection && (
              <button
                type="button"
                onClick={() => setDoarFavorite(!doarFavorite)}
                className={`cg-toolbar-btn cg-toolbar-btn--favorites ${doarFavorite ? 'cg-toolbar-btn--active' : ''}`}
                aria-pressed={doarFavorite}
              >
                <Heart
                  size={16}
                  strokeWidth={1.6}
                  fill={doarFavorite ? (profile.accentColor || '#1d1d1f') : 'none'}
                  style={{ color: doarFavorite ? (profile.accentColor || '#1d1d1f') : '#6e6e73' }}
                />
                <span>Favorites</span>
                {favCount > 0 && (
                  <span className={`cg-toolbar-fav-badge ${countPop ? "cg-count-pop" : ""}`}>
                    ({favCount})
                  </span>
                )}
              </button>
            )}

            {showShareButton && (
              <button type="button" onClick={handleShare} className="cg-toolbar-btn">
                <Share2 size={16} strokeWidth={1.6} />
                <span>Share</span>
              </button>
            )}

            {allowOriginalDownloads && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadingAll}
                className="cg-toolbar-btn cg-toolbar-btn--download"
              >
                <Download size={16} strokeWidth={1.6} />
                <span>{downloadingAll ? 'Se descarcă...' : 'Descarcă'}</span>
              </button>
            )}
          </div>
        </div>

        {allowPhotoSelection && doarFavorite && normalizedSelectionLists.length > 0 && (
          <div className="cg-favorite-lists-bar" role="tablist" aria-label="Liste favorite">
            {normalizedSelectionLists.map((list) => {
              const isActive = activeSelectionList?.id === list.id;
              const isEditing = editingFavoriteListId === list.id;
              return (
                <div key={list.id} className="cg-favorite-list-shell">
                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingFavoriteListName}
                      className="cg-favorite-list-input"
                      onChange={(event) => setEditingFavoriteListName(event.target.value)}
                      onBlur={() => handleRenameFavoriteList(list.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleRenameFavoriteList(list.id);
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setEditingFavoriteListId(null);
                          setEditingFavoriteListName('');
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`cg-favorite-list-tab ${isActive ? 'is-active' : ''}`}
                      onClick={() => setActiveSelectionListId(list.id)}
                      aria-pressed={isActive}
                    >
                      <span>{list.name}</span>
                      <span className="cg-favorite-list-count">{list.keys?.length || 0}</span>
                    </button>
                  )}
                  {canEditSelection && (
                    <button
                      type="button"
                      className="cg-favorite-list-menu-toggle"
                      aria-label={`Acțiuni pentru lista ${list.name}`}
                      onClick={() => {
                        setFavoriteMenuState(null);
                        setCreatingFavoriteList(false);
                        setNewFavoriteListName('');
                        setFavoriteListMenuId((prev) => (prev === list.id ? null : list.id));
                      }}
                    >
                      ⋯
                    </button>
                  )}
                  {canEditSelection && favoriteListMenuId === list.id && (
                    <div className="cg-favorite-list-menu">
                      <button type="button" className="cg-favorite-list-menu-item" onClick={() => handleStartRenameFavoriteList(list.id)}>
                        Redenumește
                      </button>
                      <button type="button" className="cg-favorite-list-menu-item is-danger" onClick={() => handleDeleteFavoriteList(list.id)}>
                        Șterge lista
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {allowPhotoSelection && numeSelectie && favCount > 0 && (
          <div className={`cg-selection-submit-bar${selectionLocked ? ' is-finalized' : ''}`}>
            <div className="cg-selection-submit-copy">
              {selectionLocked ? <CheckCircle2 size={21} aria-hidden="true" /> : <Send size={20} aria-hidden="true" />}
              <div>
                <strong>{selectionLocked ? 'Selecția a fost trimisă fotografului.' : `${favCount} ${favCount === 1 ? 'fotografie selectată' : 'fotografii selectate'}`}</strong>
                <span>
                  {selectionLocked
                    ? `Selecția este blocată${selectionFinalizedLabel ? ` din ${selectionFinalizedLabel}` : ''}. Fotograful o poate redeschide dacă ai nevoie de modificări.`
                    : 'Verifică fotografiile, apoi trimite selecția finală fotografului.'}
                </span>
              </div>
            </div>
            {!selectionLocked && (
              <button type="button" onClick={handleOpenFinalizeSelection}>
                Trimite selecția
                <Send size={15} aria-hidden="true" />
              </button>
            )}
            {selectionLocked && <LockKeyhole size={18} className="cg-selection-lock-icon" aria-hidden="true" />}
          </div>
        )}

        {/* Gallery Grid */}
        <div className="cg-gallery" onClick={() => setActiveTouchActionKey(null)}>
          {pozeAfisate.length === 0 ? (
            <div className="cg-empty">
              {doarFavorite
                ? `Lista "${activeSelectionList?.name || DEFAULT_SELECTION_LIST_NAME}" nu conține fotografii încă.`
                : (!clientFolders.length
                    ? 'Galeria este goală.'
                    : `Folderul "${activeClientFolderName || 'selectat'}" nu conține fotografii.`)}
            </div>
          ) : (
            <>
              {clientGallerySections.map((section) => (
                <section
                  key={section.id}
                  ref={(node) => {
                    if (node) clientFolderSectionRefs.current.set(section.id, node);
                    else clientFolderSectionRefs.current.delete(section.id);
                  }}
                  className="cg-folder-section"
                  data-folder-id={section.id}
                >
                  {section.id !== 'all' && (
                    <div className="cg-folder-section-header">
                      <h2>{section.name}</h2>
                      <span>{section.totalCount} {section.totalCount === 1 ? 'fotografie' : 'fotografii'}</span>
                    </div>
                  )}

                  {section.photos.length > 0 ? (
                    <Masonry
                      breakpointCols={
                        gridLayout === '3col'
                          ? { default: 3, 900: 2, 640: 1 }
                          : gridLayout === '4col'
                            ? { default: 4, 1200: 3, 900: 2, 640: 1 }
                            : { default: 4, 1320: 3, 900: 2, 640: 2, 340: 1 }
                      }
                      className="cg-masonry"
                      columnClassName="cg-masonry-col"
                    >
                      {section.photos.map((poza) => (
                        <LazyGalleryImage
                          key={poza.key}
                          pozaKey={poza.key}
                          quality={gridLayout === '4col' ? 'thumb' : 'medium'}
                          isFav={allFavoriteKeySet.has(poza.key)}
                          onFavoriteClick={handleFavoriteClick}
                          accentColor={profile.accentColor}
                          allowPhotoSelection={canEditSelection}
                          allowOriginalDownloads={allowOriginalDownloads}
                          watermarkEnabled={watermarkEnabled}
                          watermarkLabel={watermarkLabel}
                          isTouchLayout={isMobile}
                          touchActionsOpen={activeTouchActionKey === poza.key}
                          onTouchReveal={setActiveTouchActionKey}
                          favoritePicker={favoriteMenuState?.source === 'grid' && favoriteMenuState?.photoKey === poza.key ? {
                            isOpen: true,
                            lists: normalizedSelectionLists,
                            activeListId: activeSelectionList?.id || DEFAULT_SELECTION_LIST_ID,
                            newListName: newFavoriteListName,
                            creatingNewList: creatingFavoriteList,
                            inputRef: newFavoriteListInputRef,
                            onListClick: (listId) => executeFavoriteToggle(poza.key, numeSelectie, {
                              clientEmail: emailInputValue,
                              clientPhone: phoneInputValue,
                              clientAdditionalInfo: additionalInfoInputValue,
                              clientComment: commentInputValue,
                            }, listId),
                            onCreateNewListClick: handleStartFavoriteListCreation,
                            onNewListNameChange: setNewFavoriteListName,
                            onNewListConfirm: () => handleConfirmFavoriteListCreation(poza.key),
                            onNewListBlur: () => handleBlurFavoriteListCreation(poza.key),
                            onNewListCancel: handleCancelFavoriteListCreation,
                          } : null}
                          onClick={() => {
                            const nextIndex = pozeAfisate.findIndex((p) => p.key === poza.key);
                            if (nextIndex < 0) return;
                            setLightboxMemoryWindow(nextIndex);
                            setSelectedImage(nextIndex);
                            setLightboxDownloading(false);
                            seedLightboxSources(nextIndex);
                            void preloadMediumForLightbox(poza.key);
                          }}
                        />
                      ))}
                    </Masonry>
                  ) : section.totalCount === 0 ? (
                    <p className="cg-folder-section-empty">
                      {doarFavorite ? 'Nicio fotografie din acest folder nu este în lista curentă.' : 'Acest folder nu are fotografii încă.'}
                    </p>
                  ) : null}
                </section>
              ))}
              {visibleCount < pozeAfisate.length && (
                <div ref={loadMoreRef} style={{ height: 1, marginTop: 20 }} aria-hidden="true" />
              )}

              {favoriteMenuState?.source === 'lightbox' && favoriteMenuState?.photoKey && (
                <FavoriteListPicker
                  photoKey={favoriteMenuState.photoKey}
                  className="cg-fav-picker--floating"
                  lists={normalizedSelectionLists}
                  activeListId={activeSelectionList?.id || DEFAULT_SELECTION_LIST_ID}
                  newListName={newFavoriteListName}
                  creatingNewList={creatingFavoriteList}
                  inputRef={newFavoriteListInputRef}
                  onListClick={(listId) => executeFavoriteToggle(favoriteMenuState.photoKey, numeSelectie, {
                    clientEmail: emailInputValue,
                    clientPhone: phoneInputValue,
                    clientAdditionalInfo: additionalInfoInputValue,
                    clientComment: commentInputValue,
                  }, listId)}
                  onCreateNewListClick={handleStartFavoriteListCreation}
                  onNewListNameChange={setNewFavoriteListName}
                  onNewListConfirm={() => handleConfirmFavoriteListCreation(favoriteMenuState.photoKey)}
                  onNewListBlur={() => handleBlurFavoriteListCreation(favoriteMenuState.photoKey)}
                  onNewListCancel={handleCancelFavoriteListCreation}
                />
              )}

              <Lightbox
                open={lightboxOpen}
                className={`mina-lightbox ${watermarkEnabled ? 'mina-lightbox--watermark' : ''}`}
                close={closeLightbox}
                index={lightboxIndex}
                on={{
                  view: ({ index }) => {
                    setLightboxMemoryWindow(index);
                    seedLightboxSources(index);
                    setSelectedImage(index);
                  },
                  click: ({ target }) => { if (target === 'backdrop') closeLightbox(); },
                }}
                slides={pozeAfisate.map((p) => ({
                  src: resolveLightboxSrc(p.key),
                }))}
                plugins={lightboxPlugins}
                controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
                styles={{
                  button: { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' },
                  root: {
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    backgroundColor: '#000',
                    '--mina-watermark-text': `"${String(watermarkLabel || 'Mina').replace(/"/g, '\\"')}"`,
                  },
                  container: { position: 'fixed', inset: 0, backgroundColor: '#000' },
                }}
                carousel={{ finite: false, preload: 1 }}
                render={{
                  buttonPrev: isMobile ? () => null : undefined,
                  buttonNext: isMobile ? () => null : undefined,
                }}
                toolbar={{
                  buttons: [
                    ...(allowPhotoSelection
                      ? [
                          <LightboxSelectionCounter
                            key="counter"
                            count={favCount}
                            limit={limit}
                            selectionTitle={selectionTitle}
                            accentColor={profile.accentColor}
                          />,
                        ]
                      : []),
                    ...(canEditSelection
                      ? [
                          <LightboxFavoriteButton
                            key="fav"
                            galerie={galerie}
                            pozeAfisate={pozeAfisate}
                            onFavoriteClick={handleFavoriteClick}
                            accentColor={profile.accentColor}
                          />,
                        ]
                      : []),
                    ...(allowOriginalDownloads
                      ? [
                          <LightboxDownloadButton
                            key="dl"
                            pozeAfisate={pozeAfisate}
                            isDownloading={lightboxDownloading}
                            setDownloading={setLightboxDownloading}
                          />,
                        ]
                      : []),
                    'close',
                  ],
                }}
              />
            </>
          )}
        </div>
        </>

        {allowReviews && (
          <section ref={reviewSectionRef} className={`cg-reviews ${reviewNudge ? 'cg-reviews--nudge' : ''}`}>
            <h3 className="cg-reviews-title">Recenzie</h3>
            <p className="cg-reviews-message">{reviewMessage}</p>

            {reviewSubmitted ? (
              <p className="cg-reviews-success">Mulțumim pentru feedback. Recenzia a fost trimisă.</p>
            ) : (
              <form className="cg-reviews-form" onSubmit={handleSubmitReview}>
                <input
                  type="text"
                  value={reviewName}
                  onChange={(e) => setReviewName(e.target.value)}
                  className="cg-reviews-input"
                  placeholder="Numele tău"
                />
                <textarea
                  rows="4"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  className="cg-reviews-textarea"
                  placeholder="Scrie recenzia ta"
                />
                <button
                  type="submit"
                  className="cg-reviews-btn"
                  disabled={reviewSubmitting}
                  style={{ background: profile.accentColor || '#1d1d1f' }}
                >
                  {reviewSubmitting ? 'Se trimite...' : 'Trimite recenzia'}
                </button>
              </form>
            )}
          </section>
        )}

        {/* Footer Brand */}
        <footer className="cg-footer">
          {showBusinessCardWidget && (
            <>
              {profile.logoPreviewUrl ? (
                <img src={profile.logoPreviewUrl} alt={profile.brandName} className="cg-footer-logo" />
              ) : (
                <p className="cg-footer-brand">{profile.brandName}</p>
              )}
              {showNameWebsiteOnCover && profile.websiteUrl && (
                <a href={normalizeUrl(profile.websiteUrl)} className="cg-footer-website" target="_blank" rel="noreferrer">
                  {profile.websiteUrl.replace(/^https?:\/\//, '')}
                </a>
              )}
              {(profile.whatsappNumber || profile.instagramUrl) && (
                <div className="cg-footer-social">
                  {profile.whatsappNumber && (
                    <a href={`https://wa.me/${profile.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="cg-footer-social-btn" title="WhatsApp" style={{ background: profile.accentColor || '#1d1d1f' }}>
                      <MessageCircle size={20} strokeWidth={1.5} />
                    </a>
                  )}
                  {profile.instagramUrl && (
                    <a href={profile.instagramUrl.startsWith('http') ? profile.instagramUrl : `https://instagram.com/${profile.instagramUrl.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="cg-footer-social-btn" title="Instagram" style={{ background: profile.accentColor || '#1d1d1f' }}>
                      <Instagram size={20} strokeWidth={1.5} />
                    </a>
                  )}
                </div>
              )}
            </>
          )}
          {hasPublicCardProfile && galerie?.userId ? (
            <Link to={'/card/' + galerie.userId} className="cg-footer-copy cg-footer-copy-link">
              Galerie creată cu Mina
            </Link>
          ) : (
            <p className="cg-footer-copy">Galerie creată cu Mina</p>
          )}
        </footer>
      </div>

      {showScrollTopButton && (
        <button
          type="button"
          className="cg-scroll-top-btn"
          onClick={handleScrollToTop}
          aria-label="Mergi la începutul paginii"
        >
          <ChevronUp size={16} strokeWidth={1.8} />
        </button>
      )}

      {/* ── FINALIZARE SELECȚIE ── */}
      {showFinalizeSelectionModal && (
        <div
          className="cg-modal-overlay"
          onClick={(event) => {
            if (event.target !== event.currentTarget || selectionFinalizing) return;
            setShowFinalizeSelectionModal(false);
            setSelectionFinalizeError('');
          }}
        >
          <div className="cg-modal cg-finalize-modal">
            <span className="cg-finalize-modal-icon" aria-hidden="true"><Send size={20} /></span>
            <h3 className="cg-modal-title">Trimite selecția fotografului?</h3>
            <p className="cg-modal-sub">
              Vei trimite <strong>{favCount} {favCount === 1 ? 'fotografie' : 'fotografii'}</strong>. După trimitere, selecția se blochează pentru a evita modificările accidentale.
            </p>
            <div className="cg-finalize-modal-note">
              Fotograful primește imediat un email și poate redeschide selecția dacă mai ai nevoie de schimbări.
            </div>
            {selectionFinalizeError && <p className="cg-finalize-modal-error">{selectionFinalizeError}</p>}
            <div className="cg-modal-actions">
              <button
                type="button"
                disabled={selectionFinalizing}
                onClick={() => { setShowFinalizeSelectionModal(false); setSelectionFinalizeError(''); }}
                className="cg-modal-btn cg-modal-btn--cancel"
              >
                Mai verific
              </button>
              <button
                type="button"
                disabled={selectionFinalizing}
                onClick={handleFinalizeSelection}
                className="cg-modal-btn cg-modal-btn--confirm"
              >
                {selectionFinalizing ? 'Se trimite…' : 'Da, trimite selecția'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NUME ── */}
      {showNameModal && (
        <div className="cg-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowNameModal(false); setPendingFavAction(null); } }}>
          <div className="cg-modal">
            <h3 className="cg-modal-title">Salvează selecția</h3>
            <p className="cg-modal-sub">
              Introdu numele tău pentru ca fotograful să știe că ești tu.
            </p>
            <div className="cg-modal-fields">
              <div className="cg-modal-field">
                <label className="cg-modal-label">Numele tău</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="Ex: Maria Ionescu"
                  value={nameInputValue}
                  onChange={(e) => setNameInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  className="cg-modal-input"
                />
              </div>
              {(requiresEmail || emailInputValue) && (
                <div className="cg-modal-field">
                  <label className="cg-modal-label">Email {requiresEmail ? '(obligatoriu)' : '(opțional)'}</label>
                  <input
                    type="email"
                    placeholder="Ex: client@email.com"
                    value={emailInputValue}
                    onChange={(e) => setEmailInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                    className="cg-modal-input"
                  />
                </div>
              )}
              {(requiresPhone || phoneInputValue) && (
                <div className="cg-modal-field">
                  <label className="cg-modal-label">Telefon {requiresPhone ? '(obligatoriu)' : '(opțional)'}</label>
                  <input
                    type="text"
                    placeholder="Ex: 07xxxxxxxx"
                    value={phoneInputValue}
                    onChange={(e) => setPhoneInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                    className="cg-modal-input"
                  />
                </div>
              )}
              {(requiresAdditionalInfo || additionalInfoInputValue) && (
                <div className="cg-modal-field">
                  <label className="cg-modal-label">Informații adiționale {requiresAdditionalInfo ? '(obligatoriu)' : '(opțional)'}</label>
                  <textarea
                    rows="3"
                    placeholder="Ex: cod comandă, preferințe etc."
                    value={additionalInfoInputValue}
                    onChange={(e) => setAdditionalInfoInputValue(e.target.value)}
                    className="cg-modal-input"
                  />
                </div>
              )}
              {allowSelectionComments && (
                <div className="cg-modal-field">
                  <label className="cg-modal-label">Comentariu (opțional)</label>
                  <textarea
                    rows="3"
                    placeholder="Mesaj pentru fotograf"
                    value={commentInputValue}
                    onChange={(e) => setCommentInputValue(e.target.value)}
                    className="cg-modal-input"
                  />
                </div>
              )}
              {!favoritesSettings?.favoritesName && !galerie?.numeSelectieClient && (
                <div className="cg-modal-field">
                  <label className="cg-modal-label">Numele selecției (opțional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Poze Album, Favorite"
                    value={selectionTitleInputValue}
                    onChange={(e) => setSelectionTitleInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                    className="cg-modal-input"
                  />
                </div>
              )}
            </div>
            <div className="cg-modal-actions">
              <button
                onClick={() => { setShowNameModal(false); setPendingFavAction(null); setSelectionTitleInputValue(''); }}
                className="cg-modal-btn cg-modal-btn--cancel"
              >
                Anulează
              </button>
              <button onClick={handleSaveName} className="cg-modal-btn cg-modal-btn--confirm">
                Continuă
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .cg-root {
          font-family: 'DM Sans', -apple-system, sans-serif;
          background: #f9f8f6;
          min-height: 100vh;
          color: #1d1d1f;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
          animation: cgPageIn 220ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* ── Cover ── */
        .cg-cover {
          position: fixed;
          inset: 0;
          z-index: 50;
          overflow: hidden;
          transition: transform 0.85s cubic-bezier(0.76, 0, 0.24, 1), opacity 0.85s ease;
        }
        .cg-cover--hidden {
          transform: translateY(-100%);
          opacity: 0;
          pointer-events: none;
        }
        .cg-cover-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          transition: filter 0.6s ease;
        }
        .cg-cover-img--blurred { filter: blur(12px); transform: scale(1.04); }
        .cg-cover-fallback {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #111 0%, #1a1a1a 100%);
        }
        .cg-cover-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.65) 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 32px 40px;
          color: #fff;
        }
        .cg-cover-brand {
          position: absolute;
          top: 32px;
          left: 0;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        .cg-cover-logo {
          height: 36px;
          max-width: 160px;
          object-fit: contain;
          filter: brightness(0) invert(1);
          opacity: 0.9;
        }
        .cg-cover-brand-name {
          font-family: 'DM Serif Display', Georgia, serif;
          font-style: italic;
          font-size: 1rem;
          font-weight: 400;
          opacity: 0.85;
          letter-spacing: 0.04em;
        }
        .cg-cover-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 16px;
          width: min(92vw, 980px);
          margin: 0 auto;
        }
        .cg-cover-title {
          font-family: 'DM Serif Display', Georgia, serif;
          font-size: clamp(2.2rem, 7vw, 5rem);
          font-weight: 400;
          line-height: 1.06;
          letter-spacing: -0.02em;
          color: #fff;
          text-shadow: 0 2px 20px rgba(0,0,0,0.3);
          margin: 0;
        }
        .cg-cover-meta {
          font-family: 'DM Sans', sans-serif;
          font-size: 0.75rem;
          font-weight: 400;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.65;
          margin: 0;
        }
        .cg-cover-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          padding: 13px 28px;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.3);
          color: #fff;
          border-radius: 100px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 400;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
          letter-spacing: 0.01em;
        }
        .cg-cover-btn:hover {
          background: rgba(255,255,255,0.22);
          border-color: rgba(255,255,255,0.5);
        }
        .cg-cover-count {
          position: absolute;
          left: 50%;
          bottom: 32px;
          transform: translateX(-50%);
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 300;
          opacity: 0.5;
          letter-spacing: 0.04em;
        }

        /* ── Main ── */
        .cg-main {
          opacity: 1;
          transition: opacity 0.8s ease 0.4s;
        }
        .cg-main--hidden {
          opacity: 0;
        }
        .cg-expired-block {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          background: #f5f5f7;
        }
        .cg-expired-message {
          font-family: 'DM Sans', sans-serif;
          font-size: 1.1rem;
          font-weight: 400;
          color: #3a3a3c;
          text-align: center;
          margin: 0;
          max-width: 360px;
        }
        .cg-privacy-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #f5f5f7;
        }
        .cg-privacy-card {
          width: 100%;
          max-width: 420px;
          background: #fff;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 18px;
          box-shadow: 0 18px 48px rgba(0,0,0,0.08);
          padding: 28px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .cg-privacy-brand {
          font-family: 'DM Serif Display', Georgia, serif;
          font-style: italic;
          color: #1d1d1f;
          font-size: 1.25rem;
          margin: 0;
        }
        .cg-privacy-title {
          margin: 0;
          font-family: 'DM Sans', sans-serif;
          font-size: 1.15rem;
          font-weight: 600;
          color: #1d1d1f;
        }
        .cg-privacy-subtitle {
          margin: 0 0 8px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          line-height: 1.45;
          color: #60636a;
        }
        .cg-privacy-input {
          width: 100%;
          border: 1px solid #dddde3;
          border-radius: 11px;
          height: 44px;
          padding: 0 14px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          outline: none;
          background: #fff;
        }
        .cg-privacy-input:focus {
          border-color: #b8965a;
          box-shadow: 0 0 0 3px rgba(184,150,90,0.15);
        }
        .cg-privacy-error {
          margin: 2px 0 0;
          font-family: 'DM Sans', sans-serif;
          color: #b91c1c;
          font-size: 13px;
        }
        .cg-privacy-actions {
          margin-top: 6px;
          display: flex;
          gap: 10px;
        }
        .cg-privacy-btn {
          border: none;
          border-radius: 999px;
          height: 42px;
          padding: 0 18px;
          background: #1d1d1f;
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .cg-privacy-btn--ghost {
          background: #f1f2f6;
          color: #222;
          font-weight: 500;
        }

        /* ── Toolbar ── */
        .cg-toolbar {
          position: sticky;
          top: 0;
          z-index: 40;
          background: #f9f8f6;
          border-bottom: 1px solid rgba(0,0,0,0.06);
          padding: 0 40px;
          height: 52px;
          min-height: 52px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
        }
        .cg-toolbar-left {
          display: flex;
          align-items: flex-end;
          gap: 18px;
          height: 100%;
          min-width: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .cg-toolbar-left::-webkit-scrollbar {
          display: none;
        }
        .cg-toolbar-tabs {
          display: flex;
          align-items: flex-end;
          gap: 18px;
          height: 100%;
          min-width: 0;
          flex: 0 0 auto;
        }
        .cg-client-name-indicator {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          color: #9a9a9a;
          white-space: nowrap;
          flex: 0 0 auto;
        }
        .cg-client-name-clear {
          border: none;
          background: transparent;
          padding: 0;
          margin: 0;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          line-height: 1;
          color: #9a9a9a;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s ease;
        }
        .cg-client-name-clear:hover {
          color: #1a1a1f;
        }
        .cg-tab-all {
          border: none;
          border-bottom: 1.5px solid transparent;
          background: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 400;
          color: #9a9a9a;
          padding: 0;
          height: 100%;
          display: inline-flex;
          align-items: center;
          margin: 0;
          position: relative;
          letter-spacing: 0.04em;
          white-space: nowrap;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .cg-tab-all:hover {
          color: #1d1d1f;
        }
        .cg-tab-all.is-active {
          color: #1d1d1f;
          border-bottom-color: #1a1a1f;
        }
        .cg-toolbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .cg-toolbar-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #fff;
          border: 1px solid rgba(0,0,0,0.1);
          border-radius: 999px;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #6e6e73;
          padding: 9px 14px;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
          white-space: nowrap;
        }
        .cg-toolbar-btn:hover {
          background: #f7f7f7;
          border-color: rgba(0,0,0,0.2);
          color: #1a1a1f;
        }
        .cg-toolbar-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .cg-toolbar-btn--active {
          background: #f3f3f3;
          border-color: rgba(0,0,0,0.28);
        }
        .cg-toolbar-fav-badge {
          font-size: 12px;
          font-weight: 600;
          color: #6a6a70;
        }
        .cg-favorite-lists-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow-x: auto;
          padding: 16px 40px 0;
          scrollbar-width: none;
        }
        .cg-favorite-lists-bar::-webkit-scrollbar {
          display: none;
        }
        .cg-selection-submit-bar {
          max-width: 1120px;
          margin: 18px auto 0;
          padding: 16px 18px;
          border: 1px solid rgba(184,150,90,0.3);
          border-radius: 16px;
          background: #fffdf8;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
        .cg-selection-submit-bar.is-finalized {
          border-color: rgba(51,126,83,0.24);
          background: #f7fbf8;
        }
        .cg-selection-submit-copy {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          min-width: 0;
          color: #b8965a;
        }
        .cg-selection-submit-bar.is-finalized .cg-selection-submit-copy { color: #337e53; }
        .cg-selection-submit-copy div { min-width: 0; }
        .cg-selection-submit-copy strong,
        .cg-selection-submit-copy span { display: block; }
        .cg-selection-submit-copy strong {
          color: #1d1d1f;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 3px;
        }
        .cg-selection-submit-copy span {
          color: #77777c;
          font-size: 12px;
          line-height: 1.45;
        }
        .cg-selection-submit-bar > button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex: 0 0 auto;
          padding: 11px 16px;
          border: none;
          border-radius: 999px;
          background: #1d1d1f;
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .cg-selection-submit-bar > button:hover { background: #363638; transform: translateY(-1px); }
        .cg-selection-lock-icon { flex: 0 0 auto; color: #337e53; }
        .cg-favorite-list-shell {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
        }
        .cg-favorite-list-tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 999px;
          background: #fff;
          color: #5f5f65;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          white-space: nowrap;
        }
        .cg-favorite-list-tab:hover {
          color: #1a1a1f;
          border-color: rgba(0,0,0,0.15);
        }
        .cg-favorite-list-tab.is-active {
          background: #1a1a1f;
          border-color: #1a1a1f;
          color: #fff;
        }
        .cg-favorite-list-count {
          font-size: 11px;
          opacity: 0.72;
        }
        .cg-favorite-list-menu-toggle {
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 999px;
          background: transparent;
          color: #8d8d94;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .cg-favorite-list-menu-toggle:hover {
          background: rgba(0,0,0,0.05);
          color: #1a1a1f;
        }
        .cg-favorite-list-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 148px;
          padding: 6px;
          border-radius: 12px;
          background: rgba(255,255,255,0.98);
          border: 1px solid rgba(0,0,0,0.08);
          box-shadow: 0 18px 36px rgba(0,0,0,0.12);
          display: flex;
          flex-direction: column;
          gap: 2px;
          z-index: 35;
        }
        .cg-favorite-list-menu-item {
          border: none;
          background: transparent;
          text-align: left;
          padding: 9px 10px;
          border-radius: 8px;
          color: #1a1a1f;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          cursor: pointer;
        }
        .cg-favorite-list-menu-item:hover {
          background: #f4f4f7;
        }
        .cg-favorite-list-menu-item.is-danger {
          color: #b42318;
        }
        .cg-favorite-list-input {
          min-width: 140px;
          border: 1px solid rgba(0,0,0,0.12);
          border-radius: 999px;
          padding: 8px 12px;
          background: #fff;
          color: #1a1a1f;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          outline: none;
        }
        .cg-favorite-list-input:focus {
          border-color: rgba(0,0,0,0.22);
          box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
        }
        .cg-scroll-top-btn {
          position: fixed;
          right: 24px;
          bottom: 24px;
          width: 42px;
          height: 42px;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 999px;
          background: rgba(255,255,255,0.96);
          color: #1d1d1f;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 24px rgba(0,0,0,0.12);
          cursor: pointer;
          z-index: 60;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .cg-scroll-top-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 28px rgba(0,0,0,0.16);
          background: #fff;
        }

        /* ── Gallery ── */
        .cg-gallery { padding: 48px 40px 0; }
        .cg-folder-section {
          scroll-margin-top: 68px;
        }
        .cg-folder-section + .cg-folder-section {
          margin-top: 72px;
        }
        .cg-folder-section-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 18px;
          margin: 0 0 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(0,0,0,0.08);
        }
        .cg-folder-section-header h2 {
          margin: 0;
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: clamp(25px, 2.3vw, 34px);
          line-height: 1;
          font-weight: 500;
          letter-spacing: -0.015em;
          color: #1d1d1f;
        }
        .cg-folder-section-header span {
          flex: 0 0 auto;
          font-family: 'DM Sans', sans-serif;
          font-size: 11px;
          font-weight: 400;
          color: #99989b;
        }
        .cg-folder-section-empty {
          margin: 0;
          padding: 22px 0 8px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          color: #a1a1a6;
        }
        .cg-empty {
          text-align: center;
          padding: 80px 24px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 300;
          color: #a1a1a6;
        }
        .cg-masonry { display: flex; margin-left: -6px; width: auto; }
        .cg-masonry-col { padding-left: 6px; background-clip: padding-box; }
        .cg-masonry-col > div { margin-bottom: 6px; }

        /* ── Item ── */
        .cg-item { cursor: pointer; overflow: hidden; border-radius: 6px; }
        .cg-item-inner {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #eceae7;
        }
        .cg-item-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          opacity: 0;
          transform: scale(1.012);
          transition:
            opacity 0.42s ease,
            transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .cg-item-img--loaded { opacity: 1; transform: scale(1); }
        .cg-item:hover .cg-item-img--loaded { transform: scale(1.018); }
        .cg-item-placeholder {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          background: #eceae7;
          pointer-events: none;
        }
        .cg-item-placeholder::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.52) 50%, transparent 80%);
          animation: cg-gallery-shimmer 1.35s ease-in-out infinite;
        }
        @keyframes cg-gallery-shimmer { to { transform: translateX(100%); } }
        @media (prefers-reduced-motion: reduce) {
          .cg-item-img { transition: none; }
          .cg-item-placeholder::after { animation: none; }
        }
        .cg-item-overlay {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          padding: 20px 14px 14px;
          background: linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%);
          display: flex;
          align-items: flex-end;
          justify-content: flex-end;
          opacity: 0;
          transition: opacity 0.25s ease;
          pointer-events: none;
        }
        .cg-watermark {
          position: absolute;
          inset: auto 8px 8px auto;
          pointer-events: none;
          font-family: 'DM Sans', sans-serif;
          font-size: 11px;
          letter-spacing: 0.03em;
          color: rgba(255,255,255,0.9);
          background: rgba(0,0,0,0.28);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 999px;
          padding: 3px 8px;
          z-index: 2;
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
          text-shadow: 0 1px 1px rgba(0,0,0,0.35);
        }
        .cg-item:hover .cg-item-overlay,
        .cg-item:focus-within .cg-item-overlay,
        .cg-item-overlay--open,
        .cg-item-overlay--touch-open { opacity: 1; }
        .cg-item-overlay--selected:not(.cg-item-overlay--open) {
          background: transparent;
        }
        .cg-item-overlay--selected:not(.cg-item-overlay--open) .cg-action-btn:not(.cg-action-btn--favorite) {
          opacity: 0;
          pointer-events: none;
        }
        .cg-item:hover .cg-item-overlay--selected,
        .cg-item:focus-within .cg-item-overlay--selected {
          background: linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%);
        }
        .cg-item:hover .cg-item-overlay--selected .cg-action-btn,
        .cg-item:focus-within .cg-item-overlay--selected .cg-action-btn {
          opacity: 1;
          pointer-events: auto;
        }
        .cg-item-actions { display: flex; gap: 8px; pointer-events: none; }
        .cg-item:hover .cg-item-actions,
        .cg-item:focus-within .cg-item-actions,
        .cg-item-overlay--open .cg-item-actions,
        .cg-item-overlay--touch-open .cg-item-actions { pointer-events: auto; }
        .cg-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(10,10,12,0.72);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.55);
          box-shadow: 0 4px 14px rgba(0,0,0,0.28);
          cursor: pointer;
          color: rgba(255,255,255,0.9);
          transition: background 0.15s, transform 0.15s, opacity 0.2s;
          -webkit-tap-highlight-color: transparent;
        }
        .cg-action-btn:hover { background: rgba(5,5,7,0.9); transform: scale(1.06); }
        .cg-action-btn--active { color: #b8965a !important; }
        .cg-fav-picker {
          width: min(210px, calc(100% - 20px));
          border-radius: 14px;
          background: rgba(20,20,22,0.92);
          border: 1px solid rgba(255,255,255,0.16);
          box-shadow: 0 18px 32px rgba(0,0,0,0.24);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          overflow: hidden;
          pointer-events: auto;
        }
        .cg-fav-picker--inline {
          position: absolute;
          right: 14px;
          bottom: 60px;
          z-index: 4;
        }
        .cg-fav-picker--floating {
          position: fixed;
          top: max(76px, calc(env(safe-area-inset-top, 0px) + 20px));
          right: 20px;
          z-index: 10030;
          width: min(240px, calc(100vw - 32px));
        }
        .cg-fav-picker-list {
          display: flex;
          flex-direction: column;
          max-height: 220px;
          overflow-y: auto;
        }
        .cg-fav-picker-item {
          border: none;
          background: transparent;
          padding: 11px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          color: rgba(255,255,255,0.88);
          text-align: left;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
        }
        .cg-fav-picker-item:hover,
        .cg-fav-picker-item.is-current {
          background: rgba(255,255,255,0.08);
        }
        .cg-fav-picker-item.is-active .cg-fav-picker-item-name {
          color: #fff;
        }
        .cg-fav-picker-item-name {
          font-size: 13px;
          font-weight: 500;
        }
        .cg-fav-picker-item-meta {
          font-size: 11px;
          color: rgba(255,255,255,0.55);
          white-space: nowrap;
        }
        .cg-fav-picker-create {
          width: 100%;
          border: none;
          border-top: 1px solid rgba(255,255,255,0.12);
          background: transparent;
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 12.5px;
          font-weight: 500;
          padding: 11px 12px;
          text-align: left;
          cursor: pointer;
        }
        .cg-fav-picker-create:hover {
          background: rgba(255,255,255,0.08);
        }
        .cg-fav-picker-new {
          border-top: 1px solid rgba(255,255,255,0.12);
          padding: 12px;
        }
        .cg-fav-picker-input {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 10px;
          background: rgba(255,255,255,0.1);
          color: #fff;
          padding: 10px 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 12.5px;
          outline: none;
        }
        .cg-fav-picker-input::placeholder {
          color: rgba(255,255,255,0.42);
        }
        /* ── Reviews ── */
        .cg-reviews {
          max-width: 760px;
          margin: 40px auto 0;
          padding: 24px;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 10px 24px rgba(0,0,0,0.03);
          transition: box-shadow 0.25s ease, transform 0.25s ease;
        }
        .cg-reviews--nudge {
          box-shadow: 0 0 0 3px rgba(184,150,90,0.2), 0 14px 30px rgba(0,0,0,0.07);
          transform: translateY(-2px);
        }
        .cg-reviews-title {
          margin: 0;
          font-family: 'DM Serif Display', Georgia, serif;
          font-size: 1.6rem;
          font-weight: 400;
          color: #1d1d1f;
        }
        .cg-reviews-message {
          margin: 10px 0 18px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          color: #555a62;
          line-height: 1.5;
        }
        .cg-reviews-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .cg-reviews-input,
        .cg-reviews-textarea {
          width: 100%;
          border: 1px solid #dddde3;
          border-radius: 11px;
          padding: 11px 13px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          outline: none;
          background: #fff;
        }
        .cg-reviews-input:focus,
        .cg-reviews-textarea:focus {
          border-color: #b8965a;
          box-shadow: 0 0 0 3px rgba(184,150,90,0.15);
        }
        .cg-reviews-textarea {
          min-height: 110px;
          resize: vertical;
        }
        .cg-reviews-btn {
          align-self: flex-start;
          border: none;
          border-radius: 999px;
          height: 42px;
          padding: 0 18px;
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .cg-reviews-btn:disabled {
          opacity: 0.65;
          cursor: wait;
        }
        .cg-reviews-success {
          margin: 0;
          color: #0b7a3d;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
        }

        /* ── Footer ── */
        .cg-footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 64px 40px 48px;
          margin-top: 48px;
          border-top: 1px solid rgba(0,0,0,0.06);
          text-align: center;
        }
        .cg-footer-logo {
          height: 32px;
          max-width: 120px;
          object-fit: contain;
          opacity: 0.8;
        }
        .cg-footer-brand {
          font-family: 'DM Serif Display', Georgia, serif;
          font-style: italic;
          font-size: 1.1rem;
          font-weight: 400;
          color: #1d1d1f;
          letter-spacing: 0.01em;
        }
        .cg-footer-website {
          font-family: 'DM Sans', sans-serif;
          font-size: 12.5px;
          font-weight: 300;
          color: #86868b;
          text-decoration: none;
          transition: color 0.15s;
        }
        .cg-footer-website:hover { color: #1d1d1f; }
        .cg-footer-social { display: flex; gap: 10px; }
        .cg-footer-social-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          color: #fff;
          text-decoration: none;
          transition: transform 0.2s, opacity 0.2s;
        }
        .cg-footer-social-btn:hover { transform: scale(1.06); opacity: 0.88; }
        .cg-footer-copy {
          font-family: 'DM Sans', sans-serif;
          font-size: 11px;
          font-weight: 300;
          color: #c0c0c8;
          letter-spacing: 0.02em;
        }
        .cg-footer-copy-link {
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .cg-footer-copy-link:hover {
          color: #8f8f98;
        }

        /* ── Modal ── */
        .cg-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .cg-modal {
          background: #fff;
          border-radius: 20px;
          padding: 36px 32px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.2);
        }
        .cg-modal-title {
          font-family: 'DM Serif Display', Georgia, serif;
          font-size: 1.3rem;
          font-weight: 400;
          color: #1d1d1f;
          letter-spacing: -0.02em;
          margin: 0 0 10px;
        }
        .cg-modal-sub {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 300;
          color: #86868b;
          line-height: 1.6;
          margin: 0 0 24px;
        }
        .cg-modal-fields { display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px; }
        .cg-modal-field { display: flex; flex-direction: column; gap: 7px; }
        .cg-modal-label {
          font-family: 'DM Sans', sans-serif;
          font-size: 11.5px;
          font-weight: 500;
          color: rgba(0,0,0,0.45);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .cg-modal-input {
          width: 100%;
          padding: 12px 14px;
          border: 1px solid #e5e5e7;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 300;
          color: #1d1d1f;
          background: #fafafa;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .cg-modal-input:focus {
          border-color: #b8965a;
          box-shadow: 0 0 0 3px rgba(184,150,90,0.1);
          background: #fff;
        }
        .cg-modal-input::placeholder { color: #a1a1a6; }
        .cg-modal-actions { display: flex; gap: 10px; }
        .cg-modal-btn {
          flex: 1;
          padding: 13px;
          border: none;
          border-radius: 100px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14.5px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s;
          letter-spacing: 0.01em;
        }
        .cg-modal-btn--cancel {
          background: #f0f0f5;
          color: #3a3a3c;
        }
        .cg-modal-btn--cancel:hover { background: #e5e5ea; }
        .cg-modal-btn--confirm {
          background: #1d1d1f;
          color: #fff;
        }
        .cg-modal-btn--confirm:hover { background: #3a3a3c; }
        .cg-modal-btn:disabled { opacity: 0.58; cursor: wait; }
        .cg-finalize-modal { max-width: 440px; }
        .cg-finalize-modal-icon {
          width: 42px;
          height: 42px;
          margin-bottom: 18px;
          border-radius: 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #8c6d39;
          background: rgba(184,150,90,0.12);
        }
        .cg-finalize-modal .cg-modal-sub strong { color: #1d1d1f; font-weight: 600; }
        .cg-finalize-modal-note {
          margin: -6px 0 22px;
          padding: 12px 14px;
          border-radius: 12px;
          background: #f6f5f2;
          color: #6e6e73;
          font-size: 12.5px;
          line-height: 1.5;
        }
        .cg-finalize-modal-error {
          margin: -8px 0 18px;
          color: #b42318;
          font-size: 12.5px;
          line-height: 1.45;
        }

        /* ── Animation ── */
        @keyframes cg-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes cgPageIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes selectionCounterPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.18); }
          100% { transform: scale(1); }
        }
        .cg-count-pop { animation: selectionCounterPop 0.4s ease-out; }

        /* ── Tablet ── */
        @media (max-width: 900px) {
          .cg-toolbar { padding: 0 16px; min-height: 52px; height: 52px; }
          .cg-favorite-lists-bar { padding: 14px 16px 0; }
          .cg-selection-submit-bar { margin: 14px 16px 0; }
          .cg-gallery { padding: 28px 16px 0; }
          .cg-footer { padding: 48px 20px 40px; }
          .cg-masonry { margin-left: -6px; }
          .cg-masonry-col { padding-left: 6px; }
          .cg-masonry-col > div { margin-bottom: 6px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .cg-root {
            animation: none;
          }
        }

        /* ── Mobile ── */
        @media (max-width: 600px) {
          .cg-cover-title { font-size: 2rem; }
          .cg-cover-btn { font-size: 14px; padding: 11px 22px; }
          .cg-cover-overlay { padding: 24px 20px 32px; }
          .cg-cover-brand { top: 24px; }
          .cg-cover-count { bottom: 24px; }
          .cg-toolbar { padding: 0 12px; min-height: 52px; height: 52px; }
          .cg-toolbar-left { gap: 14px; flex: 1; }
          .cg-toolbar-tabs { gap: 14px; }
          .cg-tab-all { font-size: 13px; padding: 0; height: 100%; }
          .cg-client-name-indicator { font-size: 12px; }
          .cg-toolbar-btn { padding: 8px 10px; }
          .cg-toolbar-btn > span:not(.cg-toolbar-fav-badge) { display: none; }
          .cg-toolbar-fav-badge { display: inline; }
          .cg-favorite-lists-bar { padding: 12px 12px 0; gap: 8px; }
          .cg-selection-submit-bar {
            margin: 12px 12px 0;
            padding: 14px;
            align-items: stretch;
            flex-direction: column;
            gap: 12px;
          }
          .cg-selection-submit-bar > button { width: 100%; }
          .cg-selection-lock-icon { display: none; }
          .cg-favorite-list-tab { padding: 7px 10px; }
          .cg-favorite-list-menu-toggle { width: 26px; height: 26px; }
          .cg-gallery { padding: 20px 8px 0; }
          .cg-folder-section { scroll-margin-top: 62px; }
          .cg-folder-section + .cg-folder-section { margin-top: 48px; }
          .cg-folder-section-header {
            margin: 0 4px 12px;
            padding-bottom: 9px;
          }
          .cg-folder-section-header h2 { font-size: 24px; }
          .cg-folder-section-header span { font-size: 10px; }
          .cg-masonry { margin-left: -6px; }
          .cg-masonry-col { padding-left: 6px; }
          .cg-masonry-col > div { margin-bottom: 6px; }
          .cg-item { border-radius: 4px; }
          .cg-item-overlay,
          .cg-item-overlay--selected:not(.cg-item-overlay--open) {
            opacity: 0;
            padding: 8px;
            background: transparent;
          }
          .cg-item-overlay--touch-open,
          .cg-item-overlay--open {
            opacity: 1;
          }
          .cg-item-overlay--selected:not(.cg-item-overlay--open) .cg-action-btn:not(.cg-action-btn--favorite) {
            opacity: 0.42;
            pointer-events: auto;
          }
          .cg-action-btn {
            width: 32px;
            height: 32px;
            opacity: 0.88;
            background: rgba(10,10,12,0.68);
            border-color: rgba(255,255,255,0.48);
            box-shadow: 0 3px 12px rgba(0,0,0,0.24);
          }
          .cg-action-btn svg { width: 16px; height: 16px; }
          .cg-action-btn--active { opacity: 1; background: rgba(20,20,22,0.58); }
          .cg-footer { padding: 40px 16px 32px; margin-top: 32px; }
          .cg-scroll-top-btn {
            right: 16px;
            bottom: 16px;
            width: 40px;
            height: 40px;
          }
        }

        /* ── Lightbox mobile overrides ── */
        .mina-lightbox.yarl__portal {
          position: fixed !important;
          inset: 0 !important;
          z-index: 10000 !important;
          width: 100vw !important;
          height: 100dvh !important;
          background: #000 !important;
        }
        .mina-lightbox .yarl__container {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          height: 100dvh !important;
          background: #000 !important;
          padding-bottom: env(safe-area-inset-bottom, 0px) !important;
        }
        .mina-lightbox .yarl__toolbar {
          padding-top: max(4px, env(safe-area-inset-top, 0px)) !important;
        }
        .mina-lightbox--watermark .yarl__slide {
          position: relative;
        }
        .mina-lightbox--watermark .yarl__slide::after {
          content: var(--mina-watermark-text, "Mina");
          position: absolute;
          right: 16px;
          bottom: 16px;
          z-index: 4;
          color: rgba(255,255,255,0.92);
          background: rgba(0,0,0,0.32);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          font-family: 'DM Sans', sans-serif;
          letter-spacing: 0.04em;
          text-shadow: 0 1px 1px rgba(0,0,0,0.4);
          pointer-events: none;
        }
        @media (max-width: 768px) {
          .yarl__slide_image {
            object-fit: contain !important;
            max-height: 85vh !important;
          }
          .yarl__toolbar {
            padding: 4px 8px !important;
          }
          .mina-lightbox--watermark .yarl__slide::after {
            right: 10px;
            bottom: 10px;
            padding: 5px 10px;
            font-size: 11px;
          }
          .cg-reviews {
            margin-top: 24px;
            padding: 18px;
            border-radius: 12px;
          }
        }
      `}</style>
    </div>
  );
};

export default ClientGallery;
