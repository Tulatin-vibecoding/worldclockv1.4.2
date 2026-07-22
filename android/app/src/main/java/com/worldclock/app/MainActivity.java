package com.worldclock.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(true);
    }

    @Override
    public void onBackPressed() {
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) {
            wv.evaluateJavascript(
                "(function(){var g=window.WorldClock&&WorldClock.Globe;var d=document.getElementById('cityDetailPanel');var c=document.getElementById('cityComparePanel');var v=document.getElementById('devPanel');if(d&&d.classList.contains('open')){d.classList.remove('open');if(g){g.resume();g.forceRender();}return'1';}if(c&&c.classList.contains('open')){c.classList.remove('open');if(g){g.resume();g.forceRender();}return'1';}if(v&&v.classList.contains('open')){v.classList.remove('open');if(g){g.resume();g.forceRender();}return'1';}return'0';})()",
                result -> {
                    if ("\"1\"".equals(result) || "'1'".equals(result)) return;
                    MainActivity.super.onBackPressed();
                }
            );
        } else {
            super.onBackPressed();
        }
    }
}
