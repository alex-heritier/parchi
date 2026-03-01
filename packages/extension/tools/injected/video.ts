export type InjectedVideoCheckResult =
  | {
      success: true;
      video: {
        src: string | null;
        duration: number;
        currentTime: number;
        paused: boolean;
        videoWidth: number;
        videoHeight: number;
      };
    }
  | {
      success: false;
      error: string;
      hint?: string;
      readyState?: number;
    };

export const injectedVideoCheck = (selector: string): InjectedVideoCheckResult => {
  const video = selector
    ? document.querySelector<HTMLVideoElement>(selector)
    : document.querySelector<HTMLVideoElement>('video');

  if (!video) {
    return {
      success: false,
      error: 'No video element found on the page.',
      hint: 'Make sure the page has a <video> element, or provide a specific selector.',
    };
  }

  if (video.readyState < 2) {
    return {
      success: false,
      error: 'Video has not loaded enough data.',
      readyState: video.readyState,
      hint: 'Wait for the video to load before analyzing.',
    };
  }

  return {
    success: true,
    video: {
      src: video.currentSrc || video.src || null,
      duration: video.duration || 0,
      currentTime: video.currentTime || 0,
      paused: video.paused,
      videoWidth: video.videoWidth || 640,
      videoHeight: video.videoHeight || 480,
    },
  };
};
