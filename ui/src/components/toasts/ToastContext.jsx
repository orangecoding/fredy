import { createContext } from 'react';

const CheckoutDrawerContext = createContext({
  showToast: () => {},
});

export default CheckoutDrawerContext;
