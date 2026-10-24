// TODO: Replace this placeholder with the owner's approved refund terms.
export const REFUND_WINDOW_HOURS = 24

export const REFUND_TERMS = [
  `Akun yang sudah dikirim tidak dapat direfund, kecuali jika akun rusak dalam ${REFUND_WINDOW_HOURS} jam sejak diterima.`,
  'Laporkan masalah akun melalui Hubungi Admin.',
  'Refund yang disetujui dikirim ke metode pembayaran asal.',
] as const
