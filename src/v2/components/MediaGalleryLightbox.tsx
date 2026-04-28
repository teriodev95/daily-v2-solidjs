import { onCleanup, onMount, type Component } from 'solid-js';
import 'photoswipe/style.css';
import './media-gallery-lightbox.css';
import type PhotoSwipeClass from 'photoswipe';
import type { SlideData } from 'photoswipe';

export interface MediaGalleryItem {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  msrc?: string;
}

interface MediaGalleryLightboxProps {
  items: MediaGalleryItem[];
  initialIndex: number;
  onClose: () => void;
}

const FALLBACK_WIDTH = 1600;
const FALLBACK_HEIGHT = 1000;
const SIZE_TIMEOUT_MS = 1400;

const loadImageSize = (item: MediaGalleryItem): Promise<SlideData> => {
  if (item.width && item.height) {
    return Promise.resolve({
      src: item.src,
      msrc: item.msrc ?? item.src,
      width: item.width,
      height: item.height,
      alt: item.alt,
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    const img = new Image();
    const finish = (width = FALLBACK_WIDTH, height = FALLBACK_HEIGHT) => {
      if (settled) return;
      settled = true;
      resolve({
        src: item.src,
        msrc: item.msrc ?? item.src,
        width,
        height,
        alt: item.alt,
      });
    };

    const timer = window.setTimeout(() => finish(), SIZE_TIMEOUT_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      finish(img.naturalWidth || FALLBACK_WIDTH, img.naturalHeight || FALLBACK_HEIGHT);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish();
    };
    img.src = item.src;
  });
};

const MediaGalleryLightbox: Component<MediaGalleryLightboxProps> = (props) => {
  let pswp: InstanceType<typeof PhotoSwipeClass> | undefined;
  let closed = false;

  onMount(async () => {
    const sourceItems = props.items.filter((item) => item.src);
    if (sourceItems.length === 0) {
      props.onClose();
      return;
    }

    const { default: PhotoSwipe } = await import('photoswipe');
    const dataSource = await Promise.all(sourceItems.map(loadImageSize));
    if (closed) return;

    const initialIndex = Math.min(Math.max(props.initialIndex, 0), dataSource.length - 1);
    pswp = new PhotoSwipe({
      dataSource,
      index: initialIndex,
      bgOpacity: 1,
      showHideAnimationType: 'fade',
      initialZoomLevel: 'fit',
      secondaryZoomLevel: 1,
      maxZoomLevel: 4,
      wheelToZoom: true,
      padding: { top: 56, bottom: 40, left: 24, right: 24 },
    });

    pswp.on('destroy', () => {
      if (closed) return;
      closed = true;
      props.onClose();
    });

    pswp.init();
  });

  onCleanup(() => {
    if (closed) return;
    closed = true;
    pswp?.destroy();
  });

  return null;
};

export default MediaGalleryLightbox;
