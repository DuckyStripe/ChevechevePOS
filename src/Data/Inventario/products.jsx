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
  },
  {
    id: 2,
    product: "Corona Mega",
    sku: "SKU-002",
    category: "Beer",
    brand: "Corona",
    price: "$12.00",
    unit: 1,
    qty: 150,
    createdby: "Admin",
    productImage: "assets/img/Cheve/CoronaMega.jpeg",
  },
  {
    id: 3,
    product: "Barrilito",
    sku: "SKU-003",
    category: "Beer",
    brand: "Barrilito",
    price: "$8.00",
    unit: 1,
    qty: 10,
    createdby: "Admin",
    productImage: "assets/img/Cheve/barrilito.jpeg",
  },
  {
    id: 4,
    product: "Media Modelo",
    sku: "SKU-004",
    category: "Beer",
    brand: "Modelo",
    price: "$11.00",
    unit: 1,
    qty: 15,
    createdby: "Admin",
    productImage: "assets/img/Cheve/mediamodelo.jpeg",
  },
  {
    id: 5,
    product: "Modelo Mega",
    sku: "SKU-005",
    category: "Beer",
    brand: "Modelo",
    price: "$13.00",
    unit: 1,
    qty: 15,
    createdby: "Admin",
    productImage: "assets/img/Cheve/modelomega.jpeg",
  },
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
