// products.js
export const mockProducts = [
  {
    id: 1,
    product: "Media Corona",
    sku: "SKU-001",  // Puedes generar un SKU aleatorio si es necesario
    category: "Beer",
    brand: "Corona",
    price: "$10.00", // Sustituto estimado, puedes ajustar según necesites
    unit: 1,
    qty: 100,
    createdby: "Admin", // Suponiendo que son creados por Admin
    productImage: "assets/img/Cheve/mediaCorona.jpeg",
  }
];


export const fetchProducts = async () => {
  // Simula un retardo de red con una promesa
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockProducts;
};
const createOptions = (items, key) => {
  const uniqueItems = [...new Set(items.map(item => item[key]))];
  return uniqueItems.map(item => ({ value: item.toLowerCase(), label: item }));
}

export const fetchOptions = async () => {
  // Simula un retardo de red con una promesa
  await new Promise((resolve) => setTimeout(resolve, 500));

  const options = {
    products: createOptions(mockProducts, 'product'),
    categories: createOptions(mockProducts, 'category'),
    brands: createOptions(mockProducts, 'brand'),
    prices: createOptions(mockProducts, 'price'),
  };

  return options;
};
