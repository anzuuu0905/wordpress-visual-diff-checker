<?php
/**
 * Plugin Name: WordPress VRT Notifier
 * Description: Automatically notify VRT system when plugins/themes are updated
 * Version: 1.0.0
 * Author: WordPress VRT Team
 */

// セキュリティチェック
if (!defined('ABSPATH')) {
    exit;
}

class WordPressVrtNotifier {
    
    private $webhook_url = 'https://asia-northeast1-YOUR_PROJECT_ID.cloudfunctions.net/wordpressWebhook';
    
    public function __construct() {
        // プラグイン更新フック
        add_action('upgrader_process_complete', array($this, 'on_update_complete'), 10, 2);
        
        // テーマ更新フック
        add_action('switch_theme', array($this, 'on_theme_switch'));
        
        // 設定画面
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'admin_init'));
    }
    
    /**
     * プラグイン・テーマ更新完了時の処理
     */
    public function on_update_complete($upgrader_object, $options) {
        // 更新情報を整理
        $update_info = array(
            'site_url' => home_url(),
            'action' => 'update_complete',
            'timestamp' => current_time('mysql'),
            'update_type' => $options['type'] ?? 'unknown'
        );
        
        // プラグイン更新の場合
        if ($options['type'] === 'plugin') {
            $update_info['plugin_info'] = array(
                'plugins' => $options['plugins'] ?? array(),
                'action' => $options['action'] ?? 'unknown'
            );
        }
        
        // テーマ更新の場合
        if ($options['type'] === 'theme') {
            $update_info['theme_info'] = array(
                'themes' => $options['themes'] ?? array(),
                'action' => $options['action'] ?? 'unknown'
            );
        }
        
        // VRTシステムに通知
        $this->send_notification($update_info);
    }
    
    /**
     * テーマ切り替え時の処理
     */
    public function on_theme_switch($new_name) {
        $update_info = array(
            'site_url' => home_url(),
            'action' => 'theme_switch',
            'timestamp' => current_time('mysql'),
            'theme_info' => array(
                'new_theme' => $new_name,
                'previous_theme' => get_option('previous_theme')
            )
        );
        
        $this->send_notification($update_info);
    }
    
    /**
     * VRTシステムに通知を送信
     */
    private function send_notification($data) {
        // 通知が有効か確認
        if (!get_option('vrt_notifications_enabled', true)) {
            return;
        }
        
        // カスタムWebhook URLがあれば使用
        $webhook_url = get_option('vrt_webhook_url', $this->webhook_url);
        
        $args = array(
            'body' => json_encode($data),
            'headers' => array(
                'Content-Type' => 'application/json',
                'User-Agent' => 'WordPress-VRT-Notifier/1.0'
            ),
            'timeout' => 30,
            'blocking' => false // 非同期で送信
        );
        
        $response = wp_remote_post($webhook_url, $args);
        
        // ログ記録（デバッグ用）
        if (get_option('vrt_debug_logging', false)) {
            error_log('VRT Notification sent: ' . json_encode($data));
            if (is_wp_error($response)) {
                error_log('VRT Notification error: ' . $response->get_error_message());
            }
        }
    }
    
    /**
     * 管理画面メニューを追加
     */
    public function add_admin_menu() {
        add_options_page(
            'VRT Notifier Settings',
            'VRT Notifier',
            'manage_options',
            'vrt-notifier',
            array($this, 'admin_page')
        );
    }
    
    /**
     * 設定の初期化
     */
    public function admin_init() {
        register_setting('vrt_notifier_group', 'vrt_notifications_enabled');
        register_setting('vrt_notifier_group', 'vrt_webhook_url');
        register_setting('vrt_notifier_group', 'vrt_debug_logging');
        
        add_settings_section(
            'vrt_notifier_section',
            'VRT Notifier Settings',
            null,
            'vrt-notifier'
        );
        
        add_settings_field(
            'vrt_notifications_enabled',
            'Enable Notifications',
            array($this, 'render_checkbox'),
            'vrt-notifier',
            'vrt_notifier_section',
            array('option_name' => 'vrt_notifications_enabled')
        );
        
        add_settings_field(
            'vrt_webhook_url',
            'Webhook URL',
            array($this, 'render_text_field'),
            'vrt-notifier',
            'vrt_notifier_section',
            array('option_name' => 'vrt_webhook_url')
        );
        
        add_settings_field(
            'vrt_debug_logging',
            'Debug Logging',
            array($this, 'render_checkbox'),
            'vrt-notifier',
            'vrt_notifier_section',
            array('option_name' => 'vrt_debug_logging')
        );
    }
    
    /**
     * 管理画面の表示
     */
    public function admin_page() {
        ?>
        <div class="wrap">
            <h1>WordPress VRT Notifier Settings</h1>
            
            <div class="notice notice-info">
                <p><strong>自動通知機能:</strong> プラグインやテーマの更新時に自動でVRTシステムに通知を送信します。</p>
            </div>
            
            <form method="post" action="options.php">
                <?php
                settings_fields('vrt_notifier_group');
                do_settings_sections('vrt-notifier');
                ?>
                
                <div style="margin: 20px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #0073aa;">
                    <h3>テスト通知</h3>
                    <p>設定が正しく動作するかテストできます。</p>
                    <button type="button" class="button" onclick="sendTestNotification()">テスト通知を送信</button>
                    <div id="test-result" style="margin-top: 10px;"></div>
                </div>
                
                <?php submit_button(); ?>
            </form>
        </div>
        
        <script>
        function sendTestNotification() {
            const button = event.target;
            const resultDiv = document.getElementById('test-result');
            
            button.disabled = true;
            button.textContent = '送信中...';
            resultDiv.innerHTML = '';
            
            fetch(ajaxurl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'action=vrt_test_notification&nonce=<?php echo wp_create_nonce('vrt_test'); ?>'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    resultDiv.innerHTML = '<div class="notice notice-success inline"><p>✅ テスト通知が送信されました</p></div>';
                } else {
                    resultDiv.innerHTML = '<div class="notice notice-error inline"><p>❌ 送信に失敗しました: ' + data.data + '</p></div>';
                }
            })
            .catch(error => {
                resultDiv.innerHTML = '<div class="notice notice-error inline"><p>❌ エラー: ' + error.message + '</p></div>';
            })
            .finally(() => {
                button.disabled = false;
                button.textContent = 'テスト通知を送信';
            });
        }
        </script>
        <?php
    }
    
    /**
     * チェックボックス表示
     */
    public function render_checkbox($args) {
        $option_name = $args['option_name'];
        $value = get_option($option_name, true);
        echo '<input type="checkbox" name="' . $option_name . '" value="1" ' . checked(1, $value, false) . ' />';
    }
    
    /**
     * テキストフィールド表示
     */
    public function render_text_field($args) {
        $option_name = $args['option_name'];
        $value = get_option($option_name, $this->webhook_url);
        echo '<input type="url" name="' . $option_name . '" value="' . esc_attr($value) . '" class="regular-text" />';
        echo '<p class="description">VRTシステムのWebhook URLを入力してください</p>';
    }
}

// プラグイン初期化
new WordPressVrtNotifier();

// AJAX ハンドラー（テスト通知用）
add_action('wp_ajax_vrt_test_notification', function() {
    check_ajax_referer('vrt_test', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_die('Permission denied');
    }
    
    $notifier = new WordPressVrtNotifier();
    $test_data = array(
        'site_url' => home_url(),
        'action' => 'test_notification',
        'timestamp' => current_time('mysql'),
        'test' => true
    );
    
    // プライベートメソッドを呼ぶためにリフレクションを使用
    $reflection = new ReflectionClass($notifier);
    $method = $reflection->getMethod('send_notification');
    $method->setAccessible(true);
    $method->invoke($notifier, $test_data);
    
    wp_send_json_success('Test notification sent');
});
?>