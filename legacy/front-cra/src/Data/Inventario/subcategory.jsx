// products.js
import axios from 'axios';
import Cookies from 'js-cookie';


export const fetchSubCategory = async () => {
  const token = Cookies.get('authToken');

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getSubcategorieTable.php',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data;
      return  data ;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

