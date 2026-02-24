import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Lightbox, { useLightboxState } from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import { Zoom, Thumbnails } from 'yet-another-react-lightbox/plugins';
import 'yet-another-react-lightbox/plugins/thumbnails.css';
import { getAppServices } from '../core/bootstrap/appBootstrap';
import Masonry from 'react-masonry-css';
import { ChevronDown, Share2, Download, Heart, Clock, Instagram, MessageCircle, Loader2 } from 'lucide-react';

const BATCH_SIZE = 24;
const INITIAL_VISIBLE = 24;
const SELECTION_NAME_STORAGE_KEY = 'mina_nume_client';
const LEGACY_SELECTION_NAME_STORAGE_KEY = 'fotolio_nume_client';

const urlCache = new Map();
const { galleries: galleriesService, media: mediaService, sites: sitesService } = getAppServices();

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
  const file = new File([blob], safeName.includes('.') ? safeName : `${safeName}.jpg`, { type: blob.type || 'image/jpeg' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: safeName });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('Share failed, falling back to download:', e);
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function LazyGalleryImage({ pozaKey, index, isFav, onFavoriteClick, onClick, accentColor }) {
  const [url, setUrl] = useState(() => urlCache.get(`medium:${pozaKey}`) || urlCache.get(`thumb:${pozaKey}`) || null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (url) return;
    let cancelled = false;

    const preferredType = window.innerWidth <= 768 ? 'thumb' : 'medium';
    const preferredKey = `${preferredType}:${pozaKey}`;
    const cachedPreferred = urlCache.get(preferredKey);
    if (cachedPreferred) {
      setUrl(cachedPreferred);
      return () => { cancelled = true; };
    }

    const load = async () => {
      try {
        const preferred = await mediaService.getPhotoUrl(pozaKey, preferredType);
        if (cancelled) return;
        urlCache.set(preferredKey, preferred);
        setUrl(preferred);
        return;
      } catch (_) {
      }

      try {
        const thumb = await mediaService.getPhotoUrl(pozaKey, 'thumb');
        if (cancelled) return;
        urlCache.set(`thumb:${pozaKey}`, thumb);
        setUrl(thumb);
        return;
      } catch (_) {
      }

      try {
        const original = await mediaService.getPhotoUrl(pozaKey, 'original');
        if (cancelled) return;
        urlCache.set(`original:${pozaKey}`, original);
        setUrl(original);
      } catch (_) {
      }
    };

    load();
    return () => { cancelled = true; };
  }, [pozaKey, url]);

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

  return (
    <div className="cg-item">
      <div className="cg-item-inner">
        {url ? (
          <img
            src={url}
            alt=""
            className="cg-item-img"
            loading="lazy"
            onClick={onClick}
          />
        ) : (
          <div className="cg-item-placeholder" />
        )}
        <div className="cg-item-overlay">
          <div className="cg-item-actions">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFavoriteClick(pozaKey); }}
              className={`cg-action-btn ${isFav ? 'cg-action-btn--active' : ''}`}
              aria-label="Favorite"
              style={{ color: isFav ? (accentColor || '#b8965a') : 'rgba(255,255,255,0.9)' }}
            >
              <Heart size={20} fill={isFav ? (accentColor || '#b8965a') : 'none'} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="cg-action-btn"
              aria-label="Download"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownload(); }}
              disabled={isDownloading}
            >
              {isDownloading ? <Loader2 size={20} strokeWidth={1.5} style={{ animation: 'cg-spin 0.8s linear infinite' }} /> : <Download size={20} strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </div>
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
      onClick={() => onFavoriteClick(poza.key)}
      aria-label="Favorite"
      style={{ color: isFav ? heartColor : 'rgba(255,255,255,0.75)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Heart size={22} fill={isFav ? heartColor : 'none'} strokeWidth={1.5} />
    </button>
  );
}

function LightboxSelectionCounter({ galerie, accentColor }) {
  const count = galerie?.favorite?.length ?? 0;
  const limit = galerie?.limitSelectie ?? galerie?.maxSelectie;
  const limitColor = accentColor || '#b8965a';
  return (
    <div key="lightbox-selection-counter" style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', color: 'rgba(255,255,255,0.9)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", fontWeight: 400, marginRight: 'auto' }}>
      {limit != null ? (
        <span style={{ background: count >= limit ? limitColor : 'rgba(255,255,255,0.12)', padding: '4px 12px', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.15)', fontSize: '13px', fontWeight: 500 }}>
          {count} / {limit}
        </span>
      ) : (
        <span style={{ color: 'rgba(255,255,255,0.65)' }}>{galerie?.numeSelectieClient || 'Selecție'}: <strong style={{ color: '#fff', fontWeight: 500 }}>{count}</strong> poze</span>
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

const ClientGallery = () => {
  const { slug, id: galleryId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);

  useEffect(() => {
    if (!slug && !galleryId) { navigate('/', { replace: true }); }
  }, [slug, galleryId, navigate]);

  const [galerie, setGalerie] = useState(null);
  const [poze, setPoze] = useState([]);
  const [coverThumbUrl, setCoverThumbUrl] = useState(null);
  const [coverOriginalUrl, setCoverOriginalUrl] = useState(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [lightboxOriginalUrls, setLightboxOriginalUrls] = useState({});
  const [lightboxMediumUrls, setLightboxMediumUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [eroare, setEroare] = useState(null);
  const loadMoreRef = useRef(null);

  const [coverVisible, setCoverVisible] = useState(true);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInputValue, setNameInputValue] = useState('');
  const [selectionTitleInputValue, setSelectionTitleInputValue] = useState('');
  const [pendingFavAction, setPendingFavAction] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxDownloading, setLightboxDownloading] = useState(false);
  const [countPop, setCountPop] = useState(false);

  const [numeSelectie, setNumeSelectie] = useState(() => readStoredSelectionName());
  const [doarFavorite, setDoarFavorite] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [profile, setProfile] = useState({
    brandName: 'My Gallery', logoUrl: '', instagramUrl: '', whatsappNumber: '',
    websiteUrl: '', accentColor: '#b8965a', logoPreviewUrl: null
  });

  const contentRef = useRef(null);

  const formatDate = (val) => {
    if (!val) return null;
    const date = typeof val?.toDate === 'function' ? val.toDate() : new Date(val);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  useEffect(() => {
    const fetchDate = async () => {
      try {
        const dateGal = galleryId
          ? await galleriesService.getGalleryById(galleryId)
          : await galleriesService.getGalleryBySlug(slug);
        if (!dateGal) { setEroare('Galeria nu a fost găsită.'); setLoading(false); return; }

        if (dateGal.status === 'trash') throw new Error('Această galerie a fost ștearsă.');
        if (dateGal.statusActiv === false) throw new Error('Această galerie este inactivă.');

        setGalerie({
          ...dateGal,
          favorite: Array.isArray(dateGal?.favorite) ? dateGal.favorite : [],
        });

        if (dateGal.userId) {
          try {
            const d = await sitesService.getProfile(dateGal.userId);
            if (d) {
              let logoPreviewUrl = null;
              if (d.logoUrl) { try { logoPreviewUrl = await mediaService.getBrandingAsset(d.logoUrl); } catch { } }
              setProfile({ brandName: d.brandName || 'My Gallery', logoUrl: d.logoUrl || '', instagramUrl: d.instagramUrl || '', whatsappNumber: d.whatsappNumber || '', websiteUrl: d.websiteUrl || '', accentColor: d.accentColor || '#b8965a', logoPreviewUrl });
            } else {
              const legacy = await sitesService.getLegacySettings(dateGal.userId);
              if (legacy) {
                const d = legacy;
                setProfile((p) => ({ ...p, brandName: d.numeBrand || p.brandName, instagramUrl: d.instagram || '', websiteUrl: d.website || '' }));
              }
            }
          } catch (e) { console.error(e); }
        }

        const pozeRaw = await mediaService.listGalleryPhotos(dateGal.id, dateGal.userId);
        const pozeKeys = pozeRaw.map((p) => ({ key: p.key || p.Key, size: p.size })).filter((p) => p.key);
        setPoze(pozeKeys);

        if (pozeKeys[0]) {
          const coverKey = pozeKeys[0].key;
          mediaService.getPhotoUrl(coverKey, 'thumb').then((url) => { setCoverThumbUrl(url); urlCache.set(`thumb:${coverKey}`, url); }).catch(() => {});
        }
      } catch (err) {
        setEroare(err.message || 'Eroare la încărcare.');
      } finally {
        setLoading(false);
      }
    };
    if (slug || galleryId) fetchDate();
  }, [slug, galleryId]);

  useEffect(() => {
    if (!galerie?.id || !numeSelectie) return;
    let cancelled = false;

    const loadClientSelection = async () => {
      try {
        const selection = await galleriesService.getClientSelection(galerie.id, numeSelectie);
        if (cancelled) return;

        const fallbackLegacy = Array.isArray(galerie?.selectii?.[numeSelectie]) ? galerie.selectii[numeSelectie] : [];
        const fallbackCurrent = Array.isArray(galerie?.favorite) ? galerie.favorite : [];
        const keys = Array.isArray(selection?.keys) && selection.keys.length > 0
          ? selection.keys
          : (fallbackLegacy.length > 0 ? fallbackLegacy : fallbackCurrent);

        setGalerie(prev => prev ? ({ ...prev, favorite: Array.from(new Set(keys)) }) : prev);
      } catch (_) {
      }
    };

    loadClientSelection();
    return () => { cancelled = true; };
  }, [galerie?.id, numeSelectie]);

  const pozeAfisate = galerie ? (doarFavorite ? poze.filter((p) => galerie.favorite?.includes(p.key)) : poze) : [];

  useEffect(() => { setVisibleCount(INITIAL_VISIBLE); }, [doarFavorite]);

  useEffect(() => {
    const coverKey = poze[0]?.key;
    if (!coverKey || urlCache.get(`original:${coverKey}`)) return;
    mediaService.getPhotoUrl(coverKey, 'original').then((url) => { urlCache.set(`original:${coverKey}`, url); setCoverOriginalUrl(url); }).catch(() => {});
  }, [poze]);

  useEffect(() => {
    if (galerie) { document.title = `${galerie.nume} | ${profile.brandName || 'My Gallery'}`; }
  }, [galerie, profile.brandName]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || pozeAfisate.length === 0) return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, pozeAfisate.length)); }, { rootMargin: '200px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [pozeAfisate.length]);

  useEffect(() => {
    if (!lightboxOpen || !pozeAfisate.length) return;
    const indices = [lightboxIndex, lightboxIndex - 1, lightboxIndex + 1].filter((i) => i >= 0 && i < pozeAfisate.length);
    indices.forEach((i) => {
      const key = pozeAfisate[i].key;
      if (!urlCache.get(`original:${key}`)) {
        mediaService.getPhotoUrl(key, 'original').then((url) => {
          urlCache.set(`original:${key}`, url);
          setLightboxOriginalUrls((prev) => ({ ...prev, [key]: url }));
        }).catch(() => {});
      }
      if (!urlCache.get(`medium:${key}`)) {
        mediaService.getPhotoUrl(key, 'medium').then((url) => {
          urlCache.set(`medium:${key}`, url);
          setLightboxMediumUrls((prev) => ({ ...prev, [key]: url }));
        }).catch(() => {});
      }
      if (!urlCache.get(`thumb:${key}`)) { mediaService.getPhotoUrl(key, 'thumb').then((url) => urlCache.set(`thumb:${key}`, url)).catch(() => {}); }
    });
  }, [lightboxOpen, lightboxIndex, pozeAfisate]);

  const handleEnterGallery = () => {
    setCoverVisible(false);
    setTimeout(() => { contentRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100);
  };

  const handleShare = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: galerie?.nume, url: window.location.href }); }
      else { await navigator.clipboard.writeText(window.location.href); alert('Link copiat!'); }
    } catch (err) { console.log('Share canceled'); }
  };

  const handleFavoriteClick = (pozaKey) => {
    if (!numeSelectie) { setPendingFavAction(pozaKey); setShowNameModal(true); }
    else { executeFavoriteToggle(pozaKey, numeSelectie); }
  };

  const handleSaveName = async () => {
    if (!nameInputValue.trim()) return;
    const cleanName = nameInputValue.trim();
    persistSelectionName(cleanName);
    setNumeSelectie(cleanName);
    setShowNameModal(false);
    const titleToSave = selectionTitleInputValue.trim() || 'Selecție';
    if (!galerie?.numeSelectieClient && titleToSave) {
      setGalerie(prev => (prev ? { ...prev, numeSelectieClient: titleToSave } : prev));
    }
    setSelectionTitleInputValue('');
    if (pendingFavAction) { executeFavoriteToggle(pendingFavAction, cleanName); setPendingFavAction(null); }
  };

  const executeFavoriteToggle = async (pozaKey, numeClient) => {
    if (!galerie?.id || !numeClient) return;
    const latestSelection = await galleriesService.getClientSelection(galerie.id, numeClient).catch(() => null);
    const currentFav = Array.isArray(latestSelection?.keys)
      ? latestSelection.keys
      : (Array.isArray(galerie?.favorite) ? galerie.favorite : []);
    const isFav = currentFav.includes(pozaKey);
    try {
      const title = galerie?.numeSelectieClient || 'Selecție';
      if (isFav) {
        await galleriesService.removeClientFavorite(galerie.id, numeClient, pozaKey, title);
        const next = currentFav.filter(k => k !== pozaKey);
        setGalerie(prev => ({ ...prev, favorite: next }));
      } else {
        await galleriesService.addClientFavorite(galerie.id, numeClient, pozaKey, title);
        const next = Array.from(new Set([...currentFav, pozaKey]));
        setGalerie(prev => ({ ...prev, favorite: next }));
        setCountPop(true);
        setTimeout(() => setCountPop(false), 450);
      }
    } catch (e) { console.error(e); }
  };

  const handleDownload = async () => {
    const targets = doarFavorite ? poze.filter(p => galerie.favorite?.includes(p.key)) : poze;
    if (!window.confirm(`Descarci ${targets.length} fotografii?`)) return;
    setDownloadingAll(true);
    for (const p of targets) {
      try {
        await downloadOriginalImage(p.key, p.key.split('/').pop());
        await new Promise(r => setTimeout(r, 600));
      } catch (e) { console.error(e); }
    }
    setDownloadingAll(false);
  };

  // Lightbox plugins — no Thumbnails on mobile (they stack vertically and break layout)
  const lightboxPlugins = isMobile ? [Zoom] : [Zoom, Thumbnails];

  if (!slug && !galleryId) return null;

  // Loading state
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontStyle: 'italic', fontSize: '1.5rem', color: '#1d1d1f', margin: '0 0 12px' }}>Mina</p>
        <p style={{ fontSize: '13px', color: '#a1a1a6', fontWeight: 300 }}>Se încarcă galeria...</p>
      </div>
    );
  }

  if (eroare) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f5f5f7', fontFamily: "'DM Sans', sans-serif", textAlign: 'center', padding: '40px' }}>
        <p style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontStyle: 'italic', fontSize: '1.5rem', color: '#1d1d1f', margin: '0 0 16px' }}>Mina</p>
        <p style={{ fontSize: '15px', color: '#3a3a3c', fontWeight: 400, margin: '0 0 8px' }}>{eroare}</p>
        <button onClick={() => navigate('/')} style={{ marginTop: '20px', padding: '12px 28px', background: '#1d1d1f', color: '#fff', border: 'none', borderRadius: '100px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px' }}>Acasă</button>
      </div>
    );
  }

  if (!galerie) return null;

  const coverImageUrl = galerie.coverUrl || coverOriginalUrl || coverThumbUrl;
  const coverIsBlurred = !galerie.coverUrl && coverThumbUrl && !coverOriginalUrl;
  const pozeVizibile = pozeAfisate.slice(0, visibleCount);
  const dataExpirareText = formatDate(galerie.dataExpirare);
  const favCount = galerie?.favorite?.length ?? 0;
  const limit = galerie?.limitSelectie ?? galerie?.maxSelectie;
  const isExpired = isGalleryExpired(galerie);

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
          />
        ) : (
          <div className="cg-cover-fallback" />
        )}

        <div className="cg-cover-overlay">
          {/* Brand logo */}
          <div className="cg-cover-brand">
            {profile.logoPreviewUrl ? (
              <img src={profile.logoPreviewUrl} alt={profile.brandName} className="cg-cover-logo" />
            ) : (
              <span className="cg-cover-brand-name">{profile.brandName}</span>
            )}
          </div>

          {/* Title */}
          <div className="cg-cover-center">
            <h1 className="cg-cover-title">{galerie.nume}</h1>
            {galerie.categoria && <p className="cg-cover-meta">{galerie.categoria}</p>}
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
          {/* Stânga: Selecție */}
          <div className="cg-toolbar-left">
            <button
              onClick={() => setDoarFavorite(!doarFavorite)}
              className={`cg-fav-toggle ${doarFavorite ? 'cg-fav-toggle--active' : ''}`}
              style={{ '--accent': profile.accentColor || '#b8965a' }}
            >
              <Heart
                size={18}
                strokeWidth={1.5}
                fill={doarFavorite ? (profile.accentColor || '#b8965a') : 'none'}
                style={{ color: doarFavorite ? (profile.accentColor || '#b8965a') : '#86868b' }}
              />
              <span className={countPop ? 'cg-count-pop' : ''}>
                {limit != null ? (
                  <span className="cg-fav-badge" style={{ '--accent': profile.accentColor || '#b8965a', '--active': favCount >= limit ? '1' : '0' }}>
                    {favCount} / {limit}
                  </span>
                ) : (
                  <>{galerie?.numeSelectieClient || 'Selecție'}: <strong>{favCount}</strong></>
                )}
              </span>
            </button>
          </div>

          {/* Dreapta: Actions */}
          <div className="cg-toolbar-right">
            {dataExpirareText && (
              <div className="cg-toolbar-expire">
                <Clock size={14} strokeWidth={1.5} />
                <span>Expiră: {dataExpirareText}</span>
              </div>
            )}
            <button onClick={handleShare} className="cg-toolbar-btn">
              <Share2 size={16} strokeWidth={1.5} />
              <span>Share</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={downloadingAll}
              className="cg-toolbar-download"
              style={{ background: profile.accentColor || '#1d1d1f' }}
            >
              <Download size={16} strokeWidth={1.5} />
              <span>{downloadingAll ? 'Se descarcă...' : 'Descarcă'}</span>
            </button>
          </div>
        </div>

        {/* Gallery Grid */}
        <div className="cg-gallery">
          {pozeAfisate.length === 0 ? (
            <div className="cg-empty">
              {doarFavorite ? 'Nu ai selectat nicio fotografie încă.' : 'Galeria este goală.'}
            </div>
          ) : (
            <>
              <Masonry
                breakpointCols={{ default: 3, 1100: 3, 900: 2, 600: 1 }}
                className="cg-masonry"
                columnClassName="cg-masonry-col"
              >
                {pozeVizibile.map((poza, index) => (
                  <LazyGalleryImage
                    key={poza.key}
                    pozaKey={poza.key}
                    index={index}
                    isFav={galerie.favorite?.includes(poza.key)}
                    onFavoriteClick={handleFavoriteClick}
                    accentColor={profile.accentColor}
                    onClick={() => {
                      setLightboxIndex(pozeAfisate.findIndex((p) => p.key === poza.key));
                      setLightboxOpen(true);
                    }}
                  />
                ))}
              </Masonry>
              {visibleCount < pozeAfisate.length && (
                <div ref={loadMoreRef} style={{ height: 1, marginTop: 20 }} aria-hidden="true" />
              )}

              <Lightbox
                open={lightboxOpen}
                close={() => setLightboxOpen(false)}
                index={lightboxIndex}
                slides={pozeAfisate.map((p) => ({
                  src: lightboxOriginalUrls[p.key]
                    || urlCache.get(`original:${p.key}`)
                    || lightboxMediumUrls[p.key]
                    || urlCache.get(`medium:${p.key}`)
                    || urlCache.get(`thumb:${p.key}`)
                    || '',
                }))}
                plugins={lightboxPlugins}
                carousel={{ finite: false }}
                render={{
                  buttonPrev: isMobile ? () => null : undefined,
                  buttonNext: isMobile ? () => null : undefined,
                }}
                toolbar={{
                  buttons: [
                    <LightboxSelectionCounter key="counter" galerie={galerie} accentColor={profile.accentColor} />,
                    <LightboxFavoriteButton key="fav" galerie={galerie} pozeAfisate={pozeAfisate} onFavoriteClick={handleFavoriteClick} accentColor={profile.accentColor} />,
                    <LightboxDownloadButton key="dl" pozeAfisate={pozeAfisate} isDownloading={lightboxDownloading} setDownloading={setLightboxDownloading} />,
                    'close',
                  ],
                }}
              />
            </>
          )}
        </div>
        </>

        {/* Footer Brand */}
        <footer className="cg-footer">
          {profile.logoPreviewUrl ? (
            <img src={profile.logoPreviewUrl} alt={profile.brandName} className="cg-footer-logo" />
          ) : (
            <p className="cg-footer-brand">{profile.brandName}</p>
          )}
          {profile.websiteUrl && (
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
          <p className="cg-footer-copy">Galerie creată cu Mina</p>
        </footer>
      </div>

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
              {!galerie?.numeSelectieClient && (
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
          background: #fff;
          min-height: 100vh;
          color: #1d1d1f;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
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
          justify-content: space-between;
          padding: 32px 32px 40px;
          color: #fff;
        }
        .cg-cover-brand {
          display: flex;
          align-items: center;
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
          text-align: center;
          gap: 16px;
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

        /* ── Toolbar ── */
        .cg-toolbar {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(255,255,255,0.9);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 1px solid rgba(0,0,0,0.07);
          padding: 0 40px;
          height: 52px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }
        .cg-toolbar-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .cg-fav-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 400;
          color: #3a3a3c;
          padding: 6px 0;
          transition: color 0.15s;
        }
        .cg-fav-toggle strong { font-weight: 500; }
        .cg-fav-badge {
          padding: 3px 10px;
          border-radius: 100px;
          background: rgba(0,0,0,0.07);
          font-size: 12.5px;
          font-weight: 500;
        }
        .cg-toolbar-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .cg-toolbar-expire {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'DM Sans', sans-serif;
          font-size: 12.5px;
          font-weight: 300;
          color: #a1a1a6;
        }
        .cg-toolbar-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 400;
          color: #3a3a3c;
          padding: 0;
          transition: color 0.15s;
        }
        .cg-toolbar-btn:hover { color: #1d1d1f; }
        .cg-toolbar-download {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 18px;
          border: none;
          border-radius: 100px;
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.15s;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }
        .cg-toolbar-download:hover { opacity: 0.88; transform: scale(1.02); }
        .cg-toolbar-download:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

        /* ── Gallery ── */
        .cg-gallery { padding: 48px 40px 0; }
        .cg-empty {
          text-align: center;
          padding: 80px 24px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 300;
          color: #a1a1a6;
        }
        .cg-masonry { display: flex; margin-left: -16px; width: auto; }
        .cg-masonry-col { padding-left: 16px; background-clip: padding-box; }
        .cg-masonry-col > div { margin-bottom: 16px; }

        /* ── Item ── */
        .cg-item { cursor: pointer; overflow: hidden; border-radius: 6px; }
        .cg-item-inner { position: relative; overflow: hidden; }
        .cg-item-img {
          width: 100%;
          height: auto;
          display: block;
          transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cg-item:hover .cg-item-img { transform: scale(1.025); }
        .cg-item-placeholder {
          width: 100%;
          aspect-ratio: 3 / 4;
          background: linear-gradient(135deg, #eaeaef, #d8d8de);
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
        }
        .cg-item:hover .cg-item-overlay { opacity: 1; }
        .cg-item-actions { display: flex; gap: 8px; }
        .cg-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255,255,255,0.18);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.3);
          cursor: pointer;
          color: rgba(255,255,255,0.9);
          transition: background 0.15s, transform 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .cg-action-btn:hover { background: rgba(255,255,255,0.28); transform: scale(1.06); }
        .cg-action-btn--active { color: #b8965a !important; }

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

        /* ── Animation ── */
        @keyframes cg-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes selectionCounterPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.18); }
          100% { transform: scale(1); }
        }
        .cg-count-pop { animation: selectionCounterPop 0.4s ease-out; }

        /* ── Tablet ── */
        @media (max-width: 900px) {
          .cg-toolbar { padding: 0 20px; gap: 12px; height: 48px; }
          .cg-gallery { padding: 32px 16px 0; }
          .cg-footer { padding: 48px 20px 40px; }
          .cg-toolbar-expire { display: none; }
          .cg-masonry { margin-left: -10px; }
          .cg-masonry-col { padding-left: 10px; }
          .cg-masonry-col > div { margin-bottom: 10px; }
        }

        /* ── Mobile ── */
        @media (max-width: 600px) {
          .cg-cover-title { font-size: 2rem; }
          .cg-cover-btn { font-size: 14px; padding: 11px 22px; }
          .cg-cover-overlay { padding: 24px 20px 32px; }
          .cg-toolbar { padding: 0 14px; height: 46px; }
          .cg-toolbar-btn span { display: none; }
          .cg-toolbar-download span { display: none; }
          .cg-toolbar-download { padding: 8px 12px; }
          .cg-gallery { padding: 20px 12px 0; }
          .cg-masonry { margin-left: -8px; }
          .cg-masonry-col { padding-left: 8px; }
          .cg-masonry-col > div { margin-bottom: 8px; }
          .cg-item { border-radius: 4px; }
          .cg-item-overlay { opacity: 1; background: linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 60%); }
          .cg-action-btn { width: 36px; height: 36px; }
          .cg-footer { padding: 40px 16px 32px; margin-top: 32px; }
        }

        /* ── Lightbox mobile overrides ── */
        @media (max-width: 768px) {
          .yarl__slide_image {
            object-fit: contain !important;
            max-height: 85vh !important;
          }
          .yarl__toolbar {
            padding: 4px 8px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ClientGallery;
