// Clean state - No dummy data. All data is fetched live from Google Sheets!

// Auto-cleanup any old dummy data stored in localStorage from earlier development sessions
const cleanupOldDummyData = () => {
  const dummyKeys = [
    'refrasynth_mock_orders',
    'refrasynth_mock_orders_v2',
    'refrasynth_mock_users',
    'refrasynth_mock_users_full',
    'refrasynth_mock_master_data',
    'refrasynth_cached_master_data',
  ];
  dummyKeys.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  });
};

cleanupOldDummyData();

export const initialMockUsers = [];
export const initialMockOrders = [];
export const initialMockMasterData = {};

export const getStoredMockOrders = () => [];
export const saveStoredMockOrders = () => {};
export const getStoredMockUsers = () => [];
export const getStoredMockMasterData = () => ({});
