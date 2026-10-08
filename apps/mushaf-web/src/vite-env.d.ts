/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** A Remotion company licence key for the in-browser render; unset means Remotion's free licence. */
  readonly VITE_REMOTION_LICENSE_KEY?: string;
}
