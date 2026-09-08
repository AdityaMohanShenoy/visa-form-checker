import 'dart:convert';
import 'dart:io';

/// Finds the backend on the local network when its IP address has moved.
///
/// ponytail: this sweeps the phone's own /24 rather than doing mDNS. The
/// backend runs under Docker Desktop, whose bridge network can't put multicast
/// on the LAN and would advertise the container's 172.x address anyway. Swap in
/// mDNS if the backend ever runs natively on the host — same call site, and it
/// would drop the /24 assumption below.
class BackendDiscovery {
  static const _probeTimeout = Duration(milliseconds: 400);

  /// ponytail: 32 at a time keeps a phone's socket table calm; a /24 worst case
  /// is ~3s, and absent hosts are the only ones that burn the full timeout.
  static const _batchSize = 32;

  /// Returns `http://<ip>:<port>` for the first host on the subnet answering
  /// the health endpoint, or null if nothing does.
  ///
  /// Scans [prefix] if given, else the phone's own /24 (e.g. `192.168.0.`),
  /// else [fallbackPrefix] — the subnet of the address we last knew about,
  /// which is right whenever the PC moved within its own network.
  static Future<String?> find({
    required int port,
    String? prefix,
    String? fallbackPrefix,
  }) async {
    final subnet = prefix ?? await localPrefix() ?? fallbackPrefix;
    if (subnet == null) return null;

    final client = HttpClient()..connectionTimeout = _probeTimeout;
    try {
      for (var start = 1; start <= 254; start += _batchSize) {
        final end = start + _batchSize - 1 > 254 ? 254 : start + _batchSize - 1;
        final results = await Future.wait([
          for (var i = start; i <= end; i++) _probe(client, '$subnet$i', port),
        ]);
        for (final url in results) {
          if (url != null) return url;
        }
      }
    } finally {
      client.close(force: true);
    }
    return null;
  }

  /// The phone's own /24 prefix, e.g. `192.168.0.` — null when it has no
  /// private IPv4 address, which means it isn't on a WiFi network at all.
  static Future<String?> localPrefix() async {
    final interfaces = await NetworkInterface.list(
      type: InternetAddressType.IPv4,
      includeLoopback: false,
    );
    for (final interface in interfaces) {
      for (final address in interface.addresses) {
        if (_isPrivate(address.address)) return prefixOf(address.address);
      }
    }
    return null;
  }

  /// `192.168.0.106` -> `192.168.0.`
  static String? prefixOf(String ipv4) {
    final cut = ipv4.lastIndexOf('.');
    return cut == -1 ? null : ipv4.substring(0, cut + 1);
  }

  static final _carrierGrade = RegExp(r'^172\.(1[6-9]|2\d|3[01])\.');

  static bool _isPrivate(String ip) =>
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      _carrierGrade.hasMatch(ip);

  /// Confirms it is *our* backend, not just anything listening on the port.
  static Future<String?> _probe(HttpClient client, String host, int port) async {
    try {
      final request = await client
          .getUrl(Uri.parse('http://$host:$port/api/v1/health'))
          .timeout(_probeTimeout);
      final response = await request.close().timeout(_probeTimeout);
      if (response.statusCode != 200) return null;
      final body =
          await response.transform(utf8.decoder).join().timeout(_probeTimeout);
      final json = jsonDecode(body);
      return (json is Map && json['status'] == 'ok')
          ? 'http://$host:$port'
          : null;
    } catch (_) {
      return null; // host absent, port closed, or something else entirely
    }
  }
}
