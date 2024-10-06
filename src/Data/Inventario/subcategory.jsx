// products.js
export const lowstock = [
    {
      key: '1',
      category: 'Electronics',
      subcategory: 'Electronics',
      categoryslug: 'electronics',
      createdon: '2024-01-12',
      status: 'Active',
    }
  ];

export const fetchSubCategory = async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return lowstock;
};

