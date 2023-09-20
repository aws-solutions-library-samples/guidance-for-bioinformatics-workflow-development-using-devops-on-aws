params.outdir = 'results'

process MULTIQC {
    container '523155489867.dkr.ecr.us-west-2.amazonaws.com/rnaseq-nf:1.1.1'
    publishDir params.outdir, mode:'copy'

    input:
    path('*') 
    path(config) 

    output:
    path('multiqc_report.html')

    script:
    """
    echo "Running multi qc"
    cp $config/* .
    echo "custom_logo: \$PWD/logo.png" >> multiqc_config.yaml
    multiqc . || ls -lr && sleep 60
    """
}
