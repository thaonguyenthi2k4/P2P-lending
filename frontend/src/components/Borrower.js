import React, { useEffect, useMemo, useState } from "react";
import { Container, Row, Col, Form, Button, Table, Card, Badge, Toast } from "react-bootstrap";
import { ethers } from "ethers";
import LendingPlatformABI from "../contracts/LendingPlatform.abi.json";
import addresses from "../contracts/contract-address.json";

const Borrower = () => {
  const abi = useMemo(() => LendingPlatformABI, []);

  const [formData, setFormData] = useState({
    amount: "",
    duration: "",
    collateral: "",
    interestRate: "",
  });

  const [account, setAccount] = useState("");
  const [balance, setBalance] = useState("");
  const [contract, setContract] = useState(null);
  const [myLoans, setMyLoans] = useState([]);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState("success");

  const showToastMessage = (message, variant = "success") => {
    setToastMessage(message);
    setToastVariant(variant);
    setShowToast(true);
  };

  useEffect(() => {
    const init = async () => {
      if (!window.ethereum) {
        showToastMessage("Metamask not detected", "danger");
        return;
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const accounts = await provider.listAccounts();

      if (accounts.length > 0) setAccount(accounts[0]);

      window.ethereum.on("accountsChanged", (accs) => {
        setAccount(accs[0] || "");
      });
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateBalance = async () => {
    if (!window.ethereum || !account) return;
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const bal = await provider.getBalance(account);
    setBalance(ethers.utils.formatEther(bal));
  };

  useEffect(() => {
    const load = async () => {
      if (!window.ethereum || !account) return;

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const instance = new ethers.Contract(addresses.LendingPlatform, abi, signer);
      setContract(instance);

      await updateBalance();
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, abi]);

  useEffect(() => {
    const run = async () => {
      if (contract && account) {
        await loadMyLoans();
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, account]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "interestRate") {
      const rate = Number(value);
      if (rate > 7) {
        showToastMessage("Interest rate cannot exceed 7%", "warning");
        return;
      }
      if (rate < 0) {
        showToastMessage("Interest rate cannot be negative", "warning");
        return;
      }
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const createLoanRequest = async (e) => {
    e.preventDefault();
    if (!contract) return;

    try {
      const amountWei = ethers.utils.parseEther(formData.amount || "0");
      const collateralWei = ethers.utils.parseEther(formData.collateral || "0");
      const durationDays = Number(formData.duration);
      const rate = Math.floor(Number(formData.interestRate));

      if (durationDays <= 0) {
        showToastMessage("Duration must be greater than 0", "warning");
        return;
      }

      // UI guard: collateral >= 2x amount
      const minCollateral = amountWei.mul(2);
      if (collateralWei.lt(minCollateral)) {
        showToastMessage("Collateral must be at least 2x the loan amount", "warning");
        return;
      }

      const tx = await contract.createLoanRequest(
        amountWei,
        durationDays,
        rate,
        { value: collateralWei }
      );

      await tx.wait();

      setFormData({ amount: "", duration: "", collateral: "", interestRate: "" });

      await updateBalance();
      await loadMyLoans();

      showToastMessage("Loan request created successfully", "success");
    } catch (err) {
      console.error(err);
      showToastMessage(err?.reason || "Transaction failed", "danger");
    }
  };

  const loadMyLoans = async () => {
    if (!contract || !account) return;

    try {
      const [loanIds, loans, requestIds, requests] = await contract.getAllActiveLoans();

      const active = loanIds.map((id, i) => ({
        id: id.toString(),
        borrower: loans[i].borrower,
        loanAmount: ethers.utils.formatEther(loans[i].loanAmount),
        stake: ethers.utils.formatEther(loans[i].stake),
        endTime: new Date(loans[i].endTime.toNumber() * 1000).toLocaleString(),
        interestRate: loans[i].interestRate.toString(),
        initialEthPrice: ethers.utils.formatUnits(loans[i].initialEthPrice, 18),
        state: "ACTIVE",
      }));

      const pending = requestIds.map((id, i) => ({
        id: id.toString(),
        borrower: requests[i].borrower,
        loanAmount: ethers.utils.formatEther(requests[i].loanAmount),
        stake: ethers.utils.formatEther(requests[i].stake),
        duration: requests[i].duration.toString(),
        interestRate: requests[i].interestRate.toString(),
        initialEthPrice: "N/A",
        state: "PENDING",
      }));

      const combined = [...active, ...pending].filter(
        (x) => x.borrower.toLowerCase() === account.toLowerCase()
      );

      setMyLoans(combined);
    } catch (err) {
      console.error(err);
      showToastMessage("Error loading loans", "danger");
    }
  };

  const repayLoan = async (loanId) => {
    if (!contract) return;

    try {
      const due = await contract.getRepayAmount(loanId);

      const tx = await contract.repayLoan(loanId, { value: due });
      await tx.wait();

      await updateBalance();
      await loadMyLoans();

      showToastMessage("Loan repaid successfully", "success");
    } catch (err) {
      console.error(err);
      showToastMessage(err?.reason || "Error repaying loan", "danger");
    }
  };

  return (
    <Container className="mt-4">
      <Toast
        show={showToast}
        onClose={() => setShowToast(false)}
        delay={3000}
        autohide
        style={{ position: "fixed", top: 20, right: 20, zIndex: 9999 }}
      >
        <Toast.Header>
          <strong className="me-auto">Notification</strong>
        </Toast.Header>
        <Toast.Body className={`bg-${toastVariant} text-white`}>
          {toastMessage}
        </Toast.Body>
      </Toast>

      <Card className="mb-4">
        <Card.Header as="h5">Borrower Dashboard</Card.Header>
        <Card.Body>
          <Card.Text>Account: {account}</Card.Text>
          <Card.Text>
            Balance: {balance ? Number(balance).toFixed(4) : "0"} ETH
          </Card.Text>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header as="h5">Create Loan Request</Card.Header>
        <Card.Body>
          <Form onSubmit={createLoanRequest}>
            <Form.Group as={Row} className="mb-3">
              <Form.Label column sm={2}>Amount (ETH)</Form.Label>
              <Col sm={10}>
                <Form.Control
                  type="number"
                  step="0.01"
                  name="amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter loan amount in ETH"
                />
              </Col>
            </Form.Group>

            <Form.Group as={Row} className="mb-3">
              <Form.Label column sm={2}>Interest Rate (%)</Form.Label>
              <Col sm={10}>
                <Form.Control
                  type="number"
                  step="0.1"
                  min="0"
                  max="7"
                  name="interestRate"
                  value={formData.interestRate}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter interest rate (max 7%)"
                />
                <Form.Text className="text-muted">
                  Maximum interest rate allowed is 7%
                </Form.Text>
              </Col>
            </Form.Group>

            <Form.Group as={Row} className="mb-3">
              <Form.Label column sm={2}>Duration (days)</Form.Label>
              <Col sm={10}>
                <Form.Control
                  type="number"
                  name="duration"
                  value={formData.duration}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter duration in days"
                />
              </Col>
            </Form.Group>

            <Form.Group as={Row} className="mb-3">
              <Form.Label column sm={2}>Collateral (ETH)</Form.Label>
              <Col sm={10}>
                <Form.Control
                  type="number"
                  step="0.01"
                  name="collateral"
                  value={formData.collateral}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter collateral amount in ETH"
                />
                <Form.Text className="text-muted">
                  Collateral must be at least 2x the loan amount
                </Form.Text>
              </Col>
            </Form.Group>

            <Button variant="primary" type="submit">Create Loan</Button>
          </Form>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header as="h5" className="d-flex justify-content-between align-items-center">
          Your Loans
          <Button variant="outline-primary" onClick={loadMyLoans}>Refresh</Button>
        </Card.Header>
        <Card.Body>
          <Table responsive>
            <thead>
              <tr>
                <th>ID</th>
                <th>Amount</th>
                <th>Duration</th>
                <th>Interest Rate</th>
                <th>Stake</th>
                <th>Initial ETH Price</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {myLoans.length === 0 && (
                <tr><td colSpan="8" className="text-center">No loans</td></tr>
              )}

              {myLoans.map((loan) => (
                <tr key={loan.id}>
                  <td>{loan.id}</td>
                  <td>{loan.loanAmount} ETH</td>
                  <td>{loan.state === "ACTIVE" ? loan.endTime : `${loan.duration} days`}</td>
                  <td>{loan.interestRate}%</td>
                  <td>{loan.stake} ETH</td>
                  <td>{loan.state === "ACTIVE" ? `$${Number(loan.initialEthPrice).toFixed(2)}` : "N/A"}</td>
                  <td>
                    <Badge bg={loan.state === "ACTIVE" ? "warning" : "info"}>
                      {loan.state}
                    </Badge>
                  </td>
                  <td>
                    {loan.state === "ACTIVE" && (
                      <Button variant="primary" onClick={() => repayLoan(loan.id)}>
                        Repay
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default Borrower;
