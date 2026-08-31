import React from 'react';
import StockCountWorkspace from './StockCountWorkspace';

/** Mid-service spot check of what is on hand right now. */
export default function AvailableStock() {
  return <StockCountWorkspace mode="available" />;
}
