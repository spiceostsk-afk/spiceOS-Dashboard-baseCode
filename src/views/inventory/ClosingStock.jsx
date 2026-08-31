import React from 'react';
import StockCountWorkspace from './StockCountWorkspace';

/** End-of-day close. See StockCountWorkspace for the shared mechanics. */
export default function ClosingStock() {
  return <StockCountWorkspace mode="closing" />;
}
