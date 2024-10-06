import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";
import { fetchRecentOrders } from "../../../Data/pos";

const ViewOrders = () => {
  const [recentorders, setRecentOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState(""); // Estado para la búsqueda

  useEffect(() => {
    const initializeData = async () => {
      const fetchedOrders = await fetchRecentOrders(); // Cambia el nombre de la variable aquí
      setRecentOrders(fetchedOrders);
    };

    initializeData();
  }, []);

  // Maneja el evento de cambio del cuadro de búsqueda
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  // Filtra las órdenes basándose en el término de búsqueda
  const filteredOrders = recentorders.filter(order =>
    order.id.toString().includes(searchTerm) ||  // Filtra por ID
    order.Vendedor.toLowerCase().includes(searchTerm.toLowerCase()) || // Filtra por Vendedor
    order.Cliente.toLowerCase().includes(searchTerm.toLowerCase()) // Filtra por Cliente
  );

  return (
    <>
      <div
        className="modal fade pos-modal"
        id="orders"
        tabIndex={-1}
        aria-hidden="true"
      >
        <div
          className="modal-dialog modal-md modal-dialog-centered"
          role="document"
        >
          <div className="modal-content">
            <div className="modal-header p-4">
              <h5 className="modal-title">Órdenes Recientes</h5>
              <button
                type="button"
                className="close"
                data-bs-dismiss="modal"
                aria-label="Close"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="modal-body p-4">
              <div className="tabs-sets">
                <div className="tab-content">
                  <div
                    className="tab-pane fade show active"
                    id="onhold"
                    role="tabpanel"
                    aria-labelledby="onhold-tab"
                  >
                    <div className="table-top">
                      <div className="search-set w-100 search-order">
                        <div className="search-input w-100">
                          <input
                            type="text"
                            placeholder="Buscar"
                            className="form-control form-control-sm formsearch w-100"
                            value={searchTerm}
                            onChange={handleSearchChange}
                          />
                          <Link to="#" className="btn btn-searchset">
                            <i
                              data-feather="search"
                              className="feather-search"
                            />
                          </Link>
                        </div>
                      </div>
                    </div>
                    <div className="order-body">
                    {filteredOrders.length > 0 ? (
                      filteredOrders.map((order) => (
                        <div className="default-cover p-4 mb-4" key={order.id}>
                          <span className="badge bg-secondary d-inline-block mb-4">
                            Ticket : #{order.id}
                          </span>
                          <div className="row">
                            <div className="col-sm-12 col-md-6 record mb-3">
                              <table>
                                <tbody>
                                  <tr className="mb-3">
                                    <td>Vendedor</td>
                                    <td className="colon">:</td>
                                    <td className="text">{order.Vendedor}</td>
                                  </tr>
                                  <tr>
                                    <td>Cliente</td>
                                    <td className="colon">:</td>
                                    <td className="text">{order.Cliente}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <div className="col-sm-12 col-md-6 record mb-3">
                              <table>
                                <tbody>
                                  <tr>
                                    <td>Total</td>
                                    <td className="colon">:</td>
                                    <td className="text">${order.Total}</td>
                                  </tr>
                                  <tr>
                                    <td>Fecha</td>
                                    <td className="colon">:</td>
                                    <td className="text">{new Date(order.Fecha).toLocaleDateString()}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                        ))
                      ) : (
                        <p>No se encontraron ordenes</p> // Mensaje opcional si no hay ítems
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ViewOrders;
