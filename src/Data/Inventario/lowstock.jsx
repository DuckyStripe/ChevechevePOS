// products.js
export const lowstock = [
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
];
export const Outstock = [
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

export const fetchLowStock = async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return lowstock;
};

export const fetchOUTStock = async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return Outstock;
};

const createOptions = (items, key) => {
  const uniqueItems = [...new Set(items.map(item => item[key]))];
  return uniqueItems.map(item => ({ value: item.toLowerCase(), label: item }));
}

export const fetchOptions = async () => {
  await new Promise(resolve => setTimeout(resolve, 500));

  const options = {
    products: createOptions(lowstock, 'product'),
    categories: createOptions(lowstock, 'category'),
    brands: createOptions(lowstock, 'brand'),
    prices: createOptions(lowstock, 'price'),
  };

  return options;
};