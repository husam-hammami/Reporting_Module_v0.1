"""
OPC UA Driver — Universal Industrial Communication
===================================================
Implements the PLCDriver interface for OPC UA servers
via the python-opcua library (legacy, synchronous API).

Using python-opcua (not asyncua) because its synchronous API
is compatible with eventlet monkey-patching used in the Flask app.

Address format: {'node_id': 'ns=2;i=5'} or {'node_id': 'ns=2;s=Temperature'}
Connection config: {'endpoint': str, 'username': str, 'password': str}
    or: {'ip': str, 'port': int} (auto-builds endpoint)

Known limitations:
- python-opcua is unmaintained (last release 2019) but stable
- Certificate-based security NOT supported (anonymous + username/password only)
- Node browsing NOT supported (users enter node_id manually)
- Bulk read uses low-level uaclient.read() API
"""

import logging

from opcua import Client as OpcUaClient, ua

from drivers import PLCDriver

logger = logging.getLogger(__name__)


class OpcUaDriver(PLCDriver):
    """OPC UA driver using python-opcua (synchronous)."""

    def __init__(self):
        self._client = None
        self._connected = False
        self._endpoint = ''

    # ── Connection ────────────────────────────────────────────────────────

    def connect(self, config: dict) -> None:
        endpoint = config.get('endpoint')
        if not endpoint:
            ip = config.get('ip', '127.0.0.1')
            port = config.get('port', 4840)
            endpoint = f"opc.tcp://{ip}:{port}"

        self._endpoint = endpoint

        if self._client:
            try:
                self._client.disconnect()
            except Exception:
                pass

        self._client = OpcUaClient(endpoint)

        # Optional authentication
        username = config.get('username', '')
        password = config.get('password', '')
        if username:
            self._client.set_user(username)
            self._client.set_password(password)

        timeout = config.get('timeout', 5)
        self._client.session_timeout = timeout * 1000  # ms

        try:
            self._client.connect()
            self._connected = True
            logger.info(f"[OPC UA] Connected to {endpoint}")
        except Exception as e:
            self._connected = False
            raise ConnectionError(f"OPC UA connection failed: {endpoint} — {e}")

    def disconnect(self) -> None:
        if self._client:
            try:
                self._client.disconnect()
            except Exception:
                pass
        self._connected = False

    def close(self) -> None:
        self.disconnect()
        self._client = None

    def is_connected(self) -> bool:
        return self._connected and self._client is not None

    @property
    def protocol_name(self) -> str:
        return 'OPC_UA'

    # ── Helpers ───────────────────────────────────────────────────────────

    def _coerce_value(self, value, data_type):
        """Coerce OPC UA native value to the expected Python type."""
        if value is None:
            return None
        data_type = (data_type or '').strip().upper()
        try:
            if data_type == 'BOOL':
                return bool(value)
            elif data_type in ('INT', 'DINT', 'DWORD'):
                return int(value)
            elif data_type == 'REAL':
                return float(value)
            elif data_type == 'STRING':
                return str(value)
            else:
                # Try float first, fall back to raw
                try:
                    return float(value)
                except (TypeError, ValueError):
                    return value
        except (TypeError, ValueError):
            return None

    # ── Single Tag Read ──────────────────────────────────────────────────

    def read_tag(self, address: dict, data_type: str, **kwargs) -> any:
        """Read a single OPC UA tag.

        address: {'node_id': 'ns=2;i=5'} or {'node_id': 'ns=2;s=Temperature'}
        OPC UA returns typed values natively — minimal conversion needed.
        """
        if not self._client:
            raise ConnectionError("Not connected")

        node_id = address.get('node_id', '')
        if not node_id:
            logger.warning("[OPC UA] Empty node_id")
            return None

        try:
            node = self._client.get_node(node_id)
            value = node.get_value()
            return self._coerce_value(value, data_type)

        except Exception as e:
            logger.warning(f"[OPC UA] Read error node={node_id}: {e}")
            self._connected = False
            return None

    # ── Batch Read ───────────────────────────────────────────────────────

    def read_batch(self, tags: list) -> dict:
        """Read multiple OPC UA tags in a single request.

        Uses low-level uaclient.read() with ReadParameters for efficiency.
        This sends a single OPC UA Read service call with all node IDs.
        """
        if not self._client:
            raise ConnectionError("Not connected")

        results = {}

        if not tags:
            return results

        try:
            # Build ReadParameters for bulk read
            params = ua.ReadParameters()
            valid_tags = []

            for tag in tags:
                node_id = tag.get('address', {}).get('node_id', '')
                if not node_id:
                    results[tag['tag_name']] = None
                    continue
                try:
                    rv = ua.ReadValueId()
                    rv.NodeId = ua.NodeId.from_string(node_id)
                    rv.AttributeId = ua.AttributeIds.Value
                    params.NodesToRead.append(rv)
                    valid_tags.append(tag)
                except Exception as e:
                    logger.warning(f"[OPC UA] Invalid node_id '{node_id}': {e}")
                    results[tag['tag_name']] = None

            if not valid_tags:
                return results

            # Execute bulk read
            data_values = self._client.uaclient.read(params)

            # Extract results
            for tag, dv in zip(valid_tags, data_values):
                try:
                    if dv.StatusCode.is_good():
                        results[tag['tag_name']] = self._coerce_value(
                            dv.Value.Value, tag.get('data_type', '')
                        )
                    else:
                        logger.debug(f"[OPC UA] Bad status for '{tag['tag_name']}': {dv.StatusCode}")
                        results[tag['tag_name']] = None
                except Exception as e:
                    logger.warning(f"[OPC UA] Extract error '{tag['tag_name']}': {e}")
                    results[tag['tag_name']] = None

        except Exception as e:
            logger.warning(f"[OPC UA] Batch read failed: {e}")
            self._connected = False
            # Fallback: try individual reads
            for tag in tags:
                if tag['tag_name'] not in results:
                    results[tag['tag_name']] = self.read_tag(
                        tag.get('address', {}),
                        tag.get('data_type', ''),
                    )

        return results
