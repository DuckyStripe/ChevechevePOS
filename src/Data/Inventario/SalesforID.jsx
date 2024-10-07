// products.js
import axios from 'axios';
import Cookies from 'js-cookie';


export const fetchSale = async (IDSale) => {
  const token = Cookies.get('authToken');
  const formData = new FormData();
  formData.append("SaleID", IDSale);

  // Configuración de solicitud con método POST
  const config = {
    method: 'post',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getSalesbyID.php',
    headers: {
      'Authorization': `Bearer ${token}`,
      // No establezcas 'Content-Type', Axios lo manejará automáticamente
    },
    data: formData // Usa 'data' para enviar el formData
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data;

      return  data;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
