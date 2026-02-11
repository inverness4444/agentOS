export const formatPrice = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(value);
