// products.js
export const sales = {
    // Datos del cliente y la factura
    ticket: 1,
    customerName: "John Doe",
    invoiceNo: "CS132453",
    customerId: "#LL93784",
    date: "01.07.2022",
    items: [
      { name: "Red Nike Laser", price: 50, qty: 3 },
      { name: "Iphone 14", price: 50, qty: 2 },
      { name: "Apple Series 8", price: 50, qty: 3 }
    ],
    subTotal: 700,
    discount: 50,
    shipping: 0,
    tax: 5,
    totalBill: 655,
    due: 0,
    totalPayable: 655,

    // Datos de la empresa
    companyName: "Dreamguys Technologies Pvt Ltd.",
    companyPhone: "+1 5656665656",
    companyEmail: "example@gmail.com"
  };

export const fetchSale = async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return sales;
};
