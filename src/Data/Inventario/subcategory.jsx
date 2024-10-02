// products.js
export const lowstock = [
    {
      key: '1',
      category: 'Electronics',
      subcategory: 'Electronics',
      categoryslug: 'electronics',
      createdon: '2024-01-12',
      status: 'Active',
    },
    {
      key: '2',
      category: 'Laptops',
      subcategory: 'Electronics',
      categoryslug: 'laptops',
      createdon: '2024-02-05',
      status: 'Active',
    },
    {
      key: '3',
      category: 'Shoes',
      subcategory: 'Electronics',
      categoryslug: 'shoes',
      createdon: '2023-11-20',
      status: 'Inactive',
    },
    {
      key: '4',
      category: 'Furniture',
      subcategory: 'Electronics',
      categoryslug: 'furniture',
      createdon: '2024-03-15',
      status: 'Active',
    },
    {
      key: '1',
      category: 'Electronics',
      subcategory: 'Electronics',
      categoryslug: 'electronics',
      createdon: '2024-01-12',
      status: 'Active',
    },
    {
      key: '2',
      category: 'Laptops',
      subcategory: 'Electronics',
      categoryslug: 'laptops',
      createdon: '2024-02-05',
      status: 'Active',
    },
    {
      key: '3',
      category: 'Shoes',
      subcategory: 'Electronics',
      categoryslug: 'shoes',
      createdon: '2023-11-20',
      status: 'Inactive',
    },
    {
      key: '4',
      category: 'Furniture',
      subcategory: 'Electronics',
      categoryslug: 'furniture',
      createdon: '2024-03-15',
      status: 'Active',
    },
    {
      key: '1',
      category: 'Electronics',
      subcategory: 'Electronics',
      categoryslug: 'electronics',
      createdon: '2024-01-12',
      status: 'Active',
    },
    {
      key: '2',
      category: 'Laptops',
      subcategory: 'Electronics',
      categoryslug: 'laptops',
      createdon: '2024-02-05',
      status: 'Active',
    },
    {
      key: '3',
      category: 'Shoes',
      subcategory: 'Electronics',
      categoryslug: 'shoes',
      createdon: '2023-11-20',
      status: 'Inactive',
    },
    {
      key: '4',
      category: 'Furniture',
      subcategory: 'Electronics',
      categoryslug: 'furniture',
      createdon: '2024-03-15',
      status: 'Active',
    },
  ];

export const fetchSubCategory = async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return lowstock;
};

