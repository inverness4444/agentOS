export const CRYPTO_PAYMENT_NETWORKS = [
  {
    key: "ERC20",
    label: "Сеть ERC20",
    address: "0x7628267db0cba86297910fd75d91cf4f0bf2c5bb"
  },
  {
    key: "TRC20",
    label: "Сеть TRC20",
    address: "TU22xAVauNPds3PxakjV97BJySJ8pKm1yG"
  }
] as const;

export type CryptoNetworkKey = (typeof CRYPTO_PAYMENT_NETWORKS)[number]["key"];

export const isCryptoNetworkKey = (value: string): value is CryptoNetworkKey =>
  CRYPTO_PAYMENT_NETWORKS.some((network) => network.key === value);

export const getCryptoNetworkAddress = (network: string) =>
  CRYPTO_PAYMENT_NETWORKS.find((item) => item.key === network)?.address ?? "";
