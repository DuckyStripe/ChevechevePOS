import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ImageWithGenericUrlCheve from "../../core/img/imagewithURLCheve";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import {
  RotateCw,
  ShoppingCart,
} from "feather-icons-react/build/IconComponents";
import { Check, CheckCircle, Trash2, UserPlus } from "react-feather";
import Select from "react-select";
import PlusCircle from "feather-icons-react/build/IconComponents/PlusCircle";
import MinusCircle from "feather-icons-react/build/IconComponents/MinusCircle";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import withReactContent from "sweetalert2-react-content";
import Swal from "sweetalert2";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import AddCustomer from "../../core/modals/peoples/addcustomer";
import ViewOrders from "../../core/modals/pos/recentorders";
import { fetchCustomerData, fetchCategoriesData } from "../../Data/pos";
import { fetchProductsPOS } from "../../Data/Inventario/products";
import ViewSale from "../../core/modals/inventory/ViewSale";
import { toast } from "react-toastify";
import axios from "axios";
import Cookies from "js-cookie";
import * as bootstrap from "bootstrap";
window.bootstrap = bootstrap;

const Pos = () => {
  const [categories, setCategorias] = useState([]);
  const [productlist, setProductlist] = useState([]);
  const [customers, setCustomers] = useState([]);
  // const [LastPurchase, setLastPurchase] = useState([]);
  const [cartItems, setCartItems] = useState(0);
  const [cart, setCart] = useState([]);
  const [subTotal, setSubTotal] = useState("MX$0.00");
  const [IVAIVA, setIVA] = useState("MX$0.00");
  const [total, setTotal] = useState("MX$0.00");
  const [selectedTicketId, setSelectedTicketId] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [filteredProductList, setFilteredProductList] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [SelectedCustomer, setSelectedCustomer] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const initializeData = async () => {
      const categorias = await fetchCategoriesData();
      const productList = await fetchProductsPOS();
      const clientes = await fetchCustomerData();

      //const LastPurchase = await fetchLastPurchaseData();
      const totalItems = categorias.reduce(
        (sum, categoria) => sum + categoria.items,
        0
      );
      const maxId = Math.max(...categorias.map((categoria) => categoria.id));
      const newId = maxId + 1; // Asignar un nuevo ID basado en el máximo valor existente
      const newCategoria = {
        id: newId,
        title: "Todas",
        items: totalItems,
      };

      categorias.unshift(newCategoria);
      setCategorias(categorias);
      setProductlist(productList);
      setCustomers(clientes);
      setFilteredProductList(productList);
    };
    initializeData();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      if (selectedCategory === "Todas") {
        // Si la categoría seleccionada es "Todas", muestra toda la lista de productos
        setFilteredProductList(productlist);
      } else {
        // Filtra la lista de productos basada en la categoría seleccionada
        const filteredList = productlist.filter(
          (product) => product.Categoria === selectedCategory
        );
        setFilteredProductList(filteredList);
      }
    }
  }, [selectedCategory, productlist]);
  const handleCategoryChange = (selectedOption) => {
    setSelectedCategory(selectedOption.title);
  };
  useEffect(() => {}, [
    selectedTicketId,
    SelectedCustomer,
    selectedPaymentMethod,
  ]);
  const clearAll = () => {
    setCartItems(0);
    setCart([]); // Ensure cart is set to an empty array
    setSubTotal(0);
    setIVA(0);
    setTotal(0);
    setSelectedTicketId([]);
    setSelectedCustomer([]);
    setSelectedPaymentMethod(null);
  };
  function convertirAPesosMexicanos(valor) {
    // Asegúrate de que el valor sea un número
    const numero = typeof valor === "number" ? valor : parseFloat(valor);

    // Verifica si la conversión fue exitosa
    if (isNaN(numero)) {
      return "MX$0.00";
    }

    // Formatea el número a pesos mexicanos con dos decimales
    return `MX$${numero.toFixed(2)}`;
  }
  const validateCartData = () => {
    const errors = {};
    if (cart.length === 0) {
      errors.cart = "No se puede crear una orden vacía.";
    }
    if (!selectedPaymentMethod) {
      errors.selectedPaymentMethod = "Debe seleccionar un método de pago.";
    }
    if (
      !SelectedCustomer ||
      SelectedCustomer == null ||
      SelectedCustomer == undefined
    ) {
      errors.SelectedCustomer = "Debe seleccionar un cliente.";
    }

    return errors;
  };
  const addToCart = async (item) => {
    if (
      !item ||
      !item.id ||
      isNaN(item.precio_venta) ||
      item.precio_venta <= 0 ||
      isNaN(item.cantidadCarrito) ||
      item.cantidadCarrito <= 0
    ) {
      console.error("Información del producto no válida");
      return;
    }
    setCart((prevCart) => {
      const existingProductIndex = prevCart.findIndex(
        (cartItem) => cartItem.id === item.id
      );

      let updatedCart;
      if (existingProductIndex !== -1) {
        // Incrementa la cantidad y actualiza el total del producto
        updatedCart = [...prevCart];
        const updatedProduct = {
          ...updatedCart[existingProductIndex],
          cantidadCarrito:
            updatedCart[existingProductIndex].cantidadCarrito + 1,
          total:
            (updatedCart[existingProductIndex].cantidadCarrito + 1) *
            updatedCart[existingProductIndex].precio_venta,
        };
        updatedCart[existingProductIndex] = updatedProduct;
      } else {
        // Añadir producto nuevo con su total inicial
        const newProduct = {
          ...item,
          total: item.cantidadCarrito * item.precio_venta,
        };
        updatedCart = [...prevCart, newProduct];
      }

      // Calcula el nuevo subtotal, IVA, y total
      const newSubTotal = updatedCart.reduce(
        (accum, product) => accum + product.total,
        0
      );
      const newIVA = newSubTotal * 0.16;
      const newTotal = newSubTotal + newIVA;

      // Actualiza los valores de subtotal, IVA y total
      setSubTotal(newSubTotal);
      setIVA(newIVA);
      setTotal(newTotal);

      return updatedCart;
    });

    setCartItems(cartItems + 1);
  };
  const handlePaymentMethodClick = (method) => {
    setSelectedPaymentMethod(method);
  };
  const handleIncrement = (id) => {
    setCart((prevCart) => {
      const updatedCart = prevCart.map((item) => {
        if (item.id === id) {
          if (item.cantidadCarrito < item.cantidad) {
            return {
              ...item,
              cantidadCarrito: item.cantidadCarrito + 1,
              total: (item.cantidadCarrito + 1) * item.precio_venta,
            };
          } else {
            Swal.fire({
              icon: "warning",
              title: "Stock insuficiente",
              text: "No hay suficiente stock disponible para esta cantidad.",
            });
            return item;
          }
        }
        return item;
      });

      calculateAndSetTotals(updatedCart); // Actualiza los totales después de cambiar el carrito

      return updatedCart;
    });
  };

  const calculateAndSetTotals = (cart) => {
    const newSubTotal = cart.reduce(
      (accum, product) => accum + product.total,
      0
    );
    const newIVA = newSubTotal * 0.16;
    const newTotal = newSubTotal + newIVA;

    setSubTotal(newSubTotal);
    setIVA(newIVA);
    setTotal(newTotal);
  };
  const handleDecrement = (id) => {
    setCart((prevCart) => {
      const updatedCart = prevCart
        .map((item) => {
          if (item.id === id) {
            const newCantidad = item.cantidadCarrito - 1;
            if (newCantidad < 0) {
              console.error("Cantidad no puede ser negativa");
              return item;
            }

            return {
              ...item,
              cantidadCarrito: newCantidad,
              total: newCantidad * item.precio_venta,
            };
          }
          return item;
        })
        .filter((item) => item.cantidadCarrito > 0);

      calculateAndSetTotals(updatedCart); // Actualiza los totales después de cambiar el carrito

      return updatedCart;
    });

    setCartItems((prevCount) => Math.max(prevCount - 1, 0));
  };

  const removeFromCart = (id) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };

  const settings = {
    dots: false,
    autoplay: false,
    slidesToShow: categories.length,
    margin: 0,
    speed: 500,
    responsive: [
      {
        breakpoint: 992,
        settings: {
          slidesToShow: 5,
        },
      },
      {
        breakpoint: 800,
        settings: {
          slidesToShow: 5,
        },
      },
      {
        breakpoint: 776,
        settings: {
          slidesToShow: 2,
        },
      },
      {
        breakpoint: 567,
        settings: {
          slidesToShow: 1,
        },
      },
    ],
  };
  const MySwal = withReactContent(Swal);

  const showConfirmationAlert = (id) => {
    MySwal.fire({
      title: "Seguro que quieres eliminar este item.",
      showCancelButton: true,
      confirmButtonColor: "#00ff00",
      confirmButtonText: "Borrar",
      cancelButtonColor: "#ff0000",
      cancelButtonText: "Cancelar",
    }).then((result) => {
      if (result.isConfirmed) {
        removeFromCart(id);
        MySwal.fire({
          title: "Eliminado",
          text: "Se ha retirado el item",
          className: "btn btn-success",
          confirmButtonText: "OK",
          customClass: {
            confirmButton: "btn btn-success",
          },
        });
      } else {
        MySwal.close();
      }
    });
  };
  const handleFormSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const token = Cookies.get("authToken");
    const errors = validateCartData();
    if (Object.keys(errors).length > 0) {
      Object.values(errors).forEach((error) => {
        toast.error(error);
      });
      setIsSubmitting(false);
      return;
    }

    const cartData = {
      products: cart.map((item) => ({
        productId: item.id,
        cantidadCarrito: item.cantidadCarrito,
      })),
    };

    const config = {
      method: "post",
      url: "https://cheveposapi.codelabs.com.mx/Endpoints/Insert/InsertPOSVenta.php",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: JSON.stringify({
        productos: cartData.products,
        metodo_pago: selectedPaymentMethod,
        cliente_id: SelectedCustomer.id,
      }),
    };

    try {
      const response = await axios.request(config);

      if (response.data.success) {
        if (response.data.venta_id) {
          setSelectedTicketId(response.data.venta_id);
        }
        toast.success("Orden creada correctamente.");

        const modalElement = document.getElementById("payment-completed");
        if (modalElement && bootstrap.Modal.getInstance(modalElement)) {
          const paymentCompletedModal = bootstrap.Modal.getInstance(modalElement);
          paymentCompletedModal.show();
        } else if (modalElement) {
          // Crea la instancia del modal si no existe
          const paymentCompletedModal = new bootstrap.Modal(modalElement);
          paymentCompletedModal.show();
        } else {
          console.error("Modal element not found!");
        }
      } else {
        toast.error(`Error: ${response.data.message}`);
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleChangeCustomer = (selectedOption) => {
    // Actualiza el estado con el cliente seleccionado
    setSelectedCustomer(selectedOption);
  };
  return (
    <div>
      {/* Same as */}
      <div className="page-wrapper pos-pg-wrapper ms-0">
        <div className="content pos-design p-0">
          <div className="btn-row d-sm-flex align-items-center">
            <Link
              to="#"
              className="btn btn-secondary mb-xs-3"
              data-bs-toggle="modal"
              data-bs-target="#orders"
            >
              <span className="me-1 d-flex align-items-center">
                <ShoppingCart className="feather-16" />
              </span>
              Ver Ordenes
            </Link>
            <Link to="#" className="btn btn-info" onClick={clearAll}>
              <span className="me-1 d-flex align-items-center">
                <RotateCw className="feather-16" />
              </span>
              Reiniciar
            </Link>
          </div>
          <div className="row align-items-start pos-wrapper">
            <div className="col-md-12 col-lg-8">
              <div className="pos-categories tabs_wrapper">
                <h5>Categorias</h5>
                <p>Selecciona la categoria del producto</p>
                <Slider
                  {...settings}
                  className="tabs owl-carousel pos-category"
                >
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      id={category.id}
                      className="pos-slick-item"
                    >
                      <Link
                        to="#"
                        onClick={() => handleCategoryChange(category)}
                      >
                        <ImageWithBasePath
                          src="assets/img/icons/dash1.svg"
                          alt={category.title}
                          height={50} // Especifica la altura deseada
                          width={50}
                          curved={true}
                        />
                      </Link>
                      <h6>
                        <Link to="#">{category.title}</Link>
                      </h6>
                      <span>{category.items} Unidades</span>
                    </div>
                  ))}
                </Slider>
                <div className="pos-products">
                  <div className="d-flex align-items-center justify-content-between">
                    <h5 className="mb-3">Productos</h5>
                  </div>
                  <div className="tabs_container">
                    <div className="container">
                      <div className="row">
                        {filteredProductList.map((product) => (
                          <div
                            className="col-sm-6 col-md-4 col-lg-3"
                            key={product.id}
                          >
                            <div className="product-info default-cover card mb-4">
                              <Link
                                to="#"
                                className="img-bg"
                                onClick={() => addToCart(product)}
                              >
                                <ImageWithGenericUrlCheve
                                  src={product.imagen_producto}
                                  alt={product.nombre_producto}
                                  height={100} // Especifica la altura deseadacurved={true}
                                  curved={true}
                                  width={100} // Especifica el ancho deseado
                                />

                                <span>
                                  <Check className="feather-16" />
                                </span>
                              </Link>

                              <div className="card-body">
                                <h6 className="cat-name">
                                  <Link to="#">{product.Categoria}</Link>
                                </h6>
                                <h6 className="product-name">
                                  <Link to="#">{product.nombre_producto}</Link>
                                </h6>
                                <div className="d-flex align-items-center justify-content-between price">
                                  <span>{product.cantidad}</span>
                                  <p>
                                    {convertirAPesosMexicanos(
                                      product.precio_venta
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-12 col-lg-4 ps-0">
              <aside className="product-order-list">
                <div className="head customer-info block-section">
                  <h6>Informacion Cliente</h6>
                  <div className="input-block d-flex align-items-center">
                    <div className="flex-grow-1">
                      <Select
                        options={customers}
                        classNamePrefix="react-select"
                        placeholder="Selecciona una opcion"
                        onChange={handleChangeCustomer} // Usa la función de cambio aquí
                        value={SelectedCustomer}
                      />
                    </div>
                    <div className="page-btn">
                      <a
                        to="#"
                        className="btn btn-added"
                        data-bs-toggle="modal"
                        data-bs-target="#add-units"
                      >
                        <UserPlus className="feather-16" />
                      </a>
                    </div>
                  </div>
                </div>
                <div className="product-added block-section">
                  <div className="head-text d-flex align-items-center justify-content-between">
                    <h6 className="d-flex align-items-center mb-0">
                      Carrito<span className="count">{cartItems}</span>
                    </h6>
                    <Link
                      to="#"
                      className="d-flex align-items-center text-danger"
                      onClick={() => clearAll()}
                    >
                      <span className="me-1">
                        <i data-feather="x" className="feather-16" />
                      </span>
                      Limpiar
                    </Link>
                  </div>
                  <div className="product-wrap">
                    {cart.length > 0 ? (
                      cart.map((item) => (
                        <div
                          className="product-list d-flex align-items-center justify-content-between"
                          key={item.id}
                        >
                          <div className="d-flex align-items-center product-info">
                            <div className="img-bg">
                              <ImageWithGenericUrlCheve
                                src={item.imagen_producto}
                                alt="Products"
                                height={100} // Especifica la altura deseada
                                width={100}
                                curved={true}
                              />
                            </div>
                            <div className="info">
                              <span>{item.Categoria}</span>
                              <h6>
                                <Link to="#">{item.nombre_producto}</Link>
                              </h6>
                              <p>
                                {convertirAPesosMexicanos(item.precio_venta)}
                              </p>
                            </div>
                          </div>
                          <div className="qty-item text-center">
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id="tooltip-minus">Quitar</Tooltip>
                              }
                            >
                              <Link
                                to="#"
                                className="dec d-flex justify-content-center align-items-center"
                                onClick={() => handleDecrement(item.id)}
                              >
                                <MinusCircle className="feather-14" />
                              </Link>
                            </OverlayTrigger>

                            <input
                              type="text"
                              className="form-control text-center"
                              name="qty"
                              value={item.cantidadCarrito}
                              readOnly
                            />
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id="tooltip-plus">Agregar</Tooltip>
                              }
                            >
                              <Link
                                to="#"
                                onClick={() => handleIncrement(item.id)}
                                className="inc d-flex justify-content-center align-items-center"
                                data-bs-toggle="tooltip"
                                data-bs-placement="top"
                                title="plus"
                              >
                                <PlusCircle className="feather-14" />
                              </Link>
                            </OverlayTrigger>
                          </div>
                          <div className="qty-item text-center">
                            <p>Total: {convertirAPesosMexicanos(item.total)}</p>
                          </div>
                          <div className="d-flex align-items-center action">
                            <Link
                              onClick={() => showConfirmationAlert(item.id)}
                              className="btn-icon delete-icon confirm-text"
                              to="#"
                            >
                              <Trash2 className="feather-14" />
                            </Link>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>No tienes productos en tu carrito</p> // Mensaje opcional si no hay ítems
                    )}
                  </div>
                </div>
                <div className="block-section">
                  <div className="order-total">
                    <table className="table table-responsive table-borderless">
                      <tbody>
                        <tr>
                          <td>Sub Total</td>
                          <td className="text-end">
                            {convertirAPesosMexicanos(subTotal)}
                          </td>
                        </tr>
                        <tr>
                          <td className="danger">IVA (16%)</td>
                          <td className="danger text-end">
                            {convertirAPesosMexicanos(IVAIVA)}
                          </td>
                        </tr>
                        <tr>
                          <td>Total</td>
                          <td className="text-end">
                            {convertirAPesosMexicanos(total)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="block-section payment-method">
                  <h6>Metodo de pago</h6>
                  <div className="row d-flex align-items-center justify-content-center methods">
                    <div className="col-md-6 col-lg-4 item">
                      <div
                        className={` ${
                          selectedPaymentMethod === "Efectivo"
                            ? "selected"
                            : "default-cover"
                        }`}
                        onClick={() => handlePaymentMethodClick("Efectivo")}
                      >
                        <Link to="#">
                          <ImageWithBasePath
                            src="assets/img/icons/cash-pay.svg"
                            alt="Método de pago Efectivo"
                          />
                          <span>Efectivo</span>
                        </Link>
                      </div>
                    </div>
                    <div className="col-md-6 col-lg-4 item">
                      <div
                        className={` ${
                          selectedPaymentMethod === "Transferencia"
                            ? "selected"
                            : "default-cover"
                        }`}
                        onClick={() =>
                          handlePaymentMethodClick("Transferencia")
                        }
                      >
                        <Link>
                          <ImageWithBasePath
                            src="assets/img/icons/credit-card.svg"
                            alt="Método de pago Transferencia"
                          />
                          <span>Transferencia</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="d-grid btn-block">
                  <Link
                    className={`btn btn-secondary ${
                      isSubmitting ? "disabled" : ""
                    }`}
                    onClick={!isSubmitting ? handleFormSubmit : null}
                  >
                    Total a pagar: {convertirAPesosMexicanos(total)}
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Completed */}
      <div
        className="modal fade modal-default"
        id="payment-completed"
        aria-labelledby="payment-completed"
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-body text-center">
              <form>
                <div className="icon-head">
                  <Link to="#">
                    <CheckCircle className="feather-40" />
                  </Link>
                </div>
                <h4>Pago Completado</h4>
                <p className="mb-0">Quieres imprimir el ticket?</p>
                <div className="modal-footer d-sm-flex justify-content-between">
                  <button
                    type="button"
                    className="btn btn-primary flex-fill me-1"
                    data-bs-toggle="modal"
                    data-bs-target="#invoice_details" // Cambiar a coincide con el id del modal
                  >
                    Imprime Ticket
                  </button>
                  <button
                    className="btn btn-secondary flex-fill"
                    data-bs-dismiss="modal"
                  >
                    Siguiente pedido
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      {/* /Products */}
      <AddCustomer />
      <ViewSale ticketId={selectedTicketId} />
      <ViewOrders />
    </div>
  );
};

export default Pos;
