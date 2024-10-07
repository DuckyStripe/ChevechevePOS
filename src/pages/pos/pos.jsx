import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ImageWithGenericUrl from "../../core/img/imagewithURL";
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
import {
  fetchCustomerData,
  fetchCategoriesData,
  fetchProductsData,
  fetchLastPurchaseData,
  fetchProductsByCategory
} from "../../Data/pos";
import ViewSale from "../../core/modals/inventory/ViewSale";

const Pos = () => {
  const [categories, setCategorias] = useState([]);
  const [productlist, setProductlist] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [LastPurchase, setLastPurchase] = useState([]);
  const [cartItems, setCartItems] = useState(0);
  const [cart, setCart] = useState([]);
  const [subTotal, setSubTotal] = useState("MX$0.00");
  const [IVAIVA, setIVA] = useState("MX$0.00");
  const [total, setTotal] = useState("MX$0.00");
  const [selectedTicketId, setSelectedTicketId] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    const initializeData = async () => {
      const categorias = await fetchCategoriesData();
      const productList = await fetchProductsData();
      const clientes = await fetchCustomerData();
      const LastPurchase = await fetchLastPurchaseData();
      setCategorias(categorias);
      setProductlist(productList);
      setCustomers(clientes);
      setLastPurchase(LastPurchase);
    };
    if (selectedCategory) {
      fetchProductsByCategory(selectedCategory.id) // Utiliza .id si el objeto categoría tienen una propiedad id
        .then((fetchedProducts) => {
          setProductlist(fetchedProducts);
        })
        .catch((error) => {
          console.error("Error fetching products:", error);
        });
    }else{

      initializeData();
    }

  }, [selectedCategory]);


  const handleCategoryChange = (selectedOption) => {
    setSelectedCategory(selectedOption)

    const prouctosbyCategory = async () => {
      const prouctosbyCategory=await fetchProductsByCategory(selectedOption);
      setProductlist(prouctosbyCategory);
    };
    prouctosbyCategory();
  };

  const clearAll = () => {
    setCartItems(0);
    setCart([]); // Ensure cart is set to an empty array
    setSubTotal(0);
    setIVA(0);
    setTotal(0);
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

  const addToCart = async (item) => {
    if (
      !item ||
      !item.id ||
      isNaN(item.precio) ||
      item.precio <= 0 ||
      isNaN(item.cantidad) ||
      item.cantidad <= 0
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
          cantidad: updatedCart[existingProductIndex].cantidad + 1,
          total:
            (updatedCart[existingProductIndex].cantidad + 1) *
            updatedCart[existingProductIndex].precio,
        };
        updatedCart[existingProductIndex] = updatedProduct;
      } else {
        // Añadir producto nuevo con su total inicial
        const newProduct = { ...item, total: item.cantidad * item.precio };
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

  const handleIncrement = (id) => {
    setCart((prevCart) => {
      const updatedCart = prevCart.map((item) => {
        if (item.id === id) {
          if (item.cantidad < item.Disponibilidad) {
            return {
              ...item,
              cantidad: item.cantidad + 1,
              total: (item.cantidad + 1) * item.precio,
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

      return updatedCart;
    });
  };

  const handleDecrement = (id) => {
    setCart((prevCart) => {
      const updatedCart = prevCart
        .map((item) => {
          if (item.id === id) {
            const newCantidad = item.cantidad - 1;
            if (newCantidad < 0) {
              console.error("Cantidad no puede ser negativa");
              return item;
            }

            return {
              ...item,
              cantidad: newCantidad,
              total: newCantidad * item.precio,
            };
          }
          return item;
        })
        .filter((item) => item.cantidad > 0);

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
    slidesToShow: 5,
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
  return (
    <div>
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
                      <Link to="#" onClick={()=>handleCategoryChange(category.id)}>
                        <ImageWithGenericUrl
                          src={category.image}
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
                        {productlist.map((product) => (
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
                                <ImageWithGenericUrl
                                  src={product.image}
                                  alt={product.title}
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
                                  <Link to="#">{product.category}</Link>
                                </h6>
                                <h6 className="product-name">
                                  <Link to="#">{product.ProductName}</Link>
                                </h6>
                                <div className="d-flex align-items-center justify-content-between price">
                                  <span>{product.Disponibilidad}</span>
                                  <p>
                                    {convertirAPesosMexicanos(product.precio)}
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
                <div className="head d-flex align-items-center justify-content-between w-100">
                  <div className="">
                    <h5>Ticket</h5>
                    <span>Transaction ID : #{LastPurchase.id}</span>
                  </div>
                </div>
                <div className="customer-info block-section">
                  <h6>Informacion Cliente</h6>
                  <div className="input-block d-flex align-items-center">
                    <div className="flex-grow-1">
                      <Select
                        options={customers}
                        classNamePrefix="react-select"
                        placeholder="Selecciona una opcion"
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
                              <ImageWithGenericUrl
                                src={item.image}
                                alt="Products"
                                height={100} // Especifica la altura deseada
                                width={100}
                                curved={true}
                              />
                            </div>
                            <div className="info">
                              <span>{item.category}</span>
                              <h6>
                                <Link to="#">{item.ProductName}</Link>
                              </h6>
                              <p>{convertirAPesosMexicanos(item.precio)}</p>
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
                              value={item.cantidad}
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
                      <div className="default-cover">
                        <Link to="#">
                          <ImageWithBasePath
                            src="assets/img/icons/cash-pay.svg"
                            alt="Payment Method"
                          />
                          <span>Efectivo</span>
                        </Link>
                      </div>
                    </div>
                    <div className="col-md-6 col-lg-4 item">
                      <div className="default-cover">
                        <Link to="#">
                          <ImageWithBasePath
                            src="assets/img/icons/credit-card.svg"
                            alt="Payment Method"
                          />
                          <span>Transferencia</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="d-grid btn-block">
                  <Link className="btn btn-secondary" to="#">
                    Grand Total : {convertirAPesosMexicanos(total)}
                  </Link>
                </div>
                <div className="btn-row d-sm-flex align-items-center justify-content-between">
                  <Link
                    to="#"
                    className="btn btn-success btn-icon flex-fill"
                    data-bs-toggle="modal"
                    data-bs-target="#payment-completed"
                  >
                    <span className="me-1 d-flex align-items-center">
                      <i data-feather="credit-card" className="feather-16" />
                    </span>
                    Pagar
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
                    onClick={() => setSelectedTicketId()}
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
